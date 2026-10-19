import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from backend.database import get_db_connection, row_to_dict

provider_bp = Blueprint("provider_bp", __name__)

@provider_bp.route("", methods=["GET"])
def get_providers():
    user_id = request.args.get("userId")
    conn = get_db_connection()
    cursor = conn.cursor()

    if user_id:
        cursor.execute("SELECT * FROM providers WHERE user_id = ? OR user_id IS NULL ORDER BY updated_at DESC", (user_id,))
    else:
        cursor.execute("SELECT * FROM providers ORDER BY updated_at DESC")
    rows = cursor.fetchall()
    
    providers = []
    for r in rows:
        p = row_to_dict(r)
        # Update live file count from files table if files exist
        cursor.execute("SELECT COUNT(*) as cnt, COALESCE(SUM(size_bytes), 0) as total_bytes FROM files WHERE provider_id = ?", (p["id"],))
        file_stats = cursor.fetchone()
        if file_stats and file_stats["cnt"] > 0:
            p["fileCount"] = file_stats["cnt"]
            # If local disk or uploaded files exist, ensure used storage reflects actual stored bytes if greater
            calc_gb = round(file_stats["total_bytes"] / (1024 ** 3), 3)
            if calc_gb > p.get("usedStorageGB", 0):
                p["usedStorageGB"] = calc_gb
                p["freeStorageGB"] = round(max(0.0, p.get("totalStorageGB", 100.0) - calc_gb), 2)
        providers.append(p)

    conn.close()
    return jsonify({"success": True, "providers": providers, "count": len(providers)})

@provider_bp.route("/<provider_id>", methods=["GET"])
def get_provider(provider_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM providers WHERE id = ?", (provider_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"success": False, "error": "Provider not found"}), 404

    p = row_to_dict(row)
    cursor.execute("SELECT COUNT(*) as cnt FROM files WHERE provider_id = ?", (provider_id,))
    file_stats = cursor.fetchone()
    if file_stats:
        p["fileCount"] = file_stats["cnt"]
    conn.close()
    return jsonify({"success": True, "provider": p})

@provider_bp.route("", methods=["POST"])
def add_provider():
    data = request.get_json() or {}
    ptype = data.get("type") or "local_disk"
    pid = data.get("id") or f"{ptype}_{int(datetime.utcnow().timestamp() * 1000)}"
    name = data.get("name") or "Connected Cloud Storage"
    icon = data.get("icon") or "ph-cloud"
    color = data.get("color") or "#00f2fe"
    status = data.get("status") or "connected"
    
    user_acc = data.get("user") or data.get("email") or data.get("userIdentifier") or ""
    email = data.get("email") or ""
    import re
    generic_placeholders = ("Google Drive Account", "Cloud Account", "Dropbox Storage Account", "OneDrive Azure Link", "Local Computer Disk Storage")
    if not user_acc or user_acc in generic_placeholders:
        match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", name + " " + email)
        if match:
            user_acc = match.group(0)
            if not email:
                email = match.group(0)
        else:
            user_acc = user_acc or name or "Cloud Account"
    if not email and "@" in str(user_acc):
        email = user_acc
    region = data.get("region") or ("Local Device System" if ptype == "local_disk" else "Cloud Server")
    
    total_gb = float(data.get("totalStorageGB") if data.get("totalStorageGB") is not None else (data.get("total_storage_gb") or 100.0))
    used_gb = float(data.get("usedStorageGB") if data.get("usedStorageGB") is not None else (data.get("used_storage_gb") or 0.0))
    
    creds = data.get("credentials")
    creds_json = json.dumps(creds) if creds and isinstance(creds, (dict, list)) else (creds if isinstance(creds, str) else None)
    
    meta = data.get("metadata") or {}
    meta_json = json.dumps(meta) if isinstance(meta, (dict, list)) else str(meta)
    
    connected_at = data.get("connectedAt") or data.get("connected_at") or datetime.utcnow().isoformat()
    last_sync = data.get("lastSync") or data.get("last_sync") or datetime.utcnow().isoformat()
    file_count = int(data.get("fileCount") or data.get("file_count") or 0)
    now = datetime.utcnow().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM providers WHERE id = ?", (pid,))
    if cursor.fetchone():
        cursor.execute("""
            UPDATE providers
            SET name = ?, type = ?, icon = ?, color = ?, status = ?,
                user = ?, email = ?, credentials = ?, total_storage_gb = ?,
                used_storage_gb = ?, region = ?, connected_at = ?, last_sync = ?,
                file_count = ?, metadata = ?, updated_at = ?
            WHERE id = ?
        """, (
            name, ptype, icon, color, status,
            user_acc, email, creds_json, total_gb,
            used_gb, region, connected_at, last_sync,
            file_count, meta_json, now, pid
        ))
    else:
        cursor.execute("""
            INSERT INTO providers (
                id, user_id, name, type, icon, color, status,
                user, email, credentials, total_storage_gb,
                used_storage_gb, region, connected_at, last_sync,
                file_count, metadata, updated_at
            ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pid, name, ptype, icon, color, status,
            user_acc, email, creds_json, total_gb,
            used_gb, region, connected_at, last_sync,
            file_count, meta_json, now
        ))

    conn.commit()
    cursor.execute("SELECT * FROM providers WHERE id = ?", (pid,))
    created = row_to_dict(cursor.fetchone())
    conn.close()

    return jsonify({"success": True, "provider": created}), 201

@provider_bp.route("/<provider_id>", methods=["PUT", "PATCH"])
def update_provider(provider_id):
    data = request.get_json() or {}
    conn = get_db_connection()
    cursor = conn.cursor()

    fields = []
    values = []
    
    field_mappings = {
        "name": "name",
        "type": "type",
        "icon": "icon",
        "color": "color",
        "status": "status",
        "user": "user",
        "email": "email",
        "region": "region",
        "connectedAt": "connected_at",
        "lastSync": "last_sync",
        "fileCount": "file_count"
    }

    for key, col in field_mappings.items():
        if key in data:
            fields.append(f"{col} = ?")
            values.append(data[key])
        elif col in data:
            fields.append(f"{col} = ?")
            values.append(data[col])

    if "totalStorageGB" in data or "total_storage_gb" in data:
        val = float(data.get("totalStorageGB") if "totalStorageGB" in data else data["total_storage_gb"])
        fields.append("total_storage_gb = ?")
        values.append(val)

    if "usedStorageGB" in data or "used_storage_gb" in data:
        val = float(data.get("usedStorageGB") if "usedStorageGB" in data else data["used_storage_gb"])
        fields.append("used_storage_gb = ?")
        values.append(val)

    if "credentials" in data:
        c = data["credentials"]
        fields.append("credentials = ?")
        values.append(json.dumps(c) if isinstance(c, (dict, list)) else (c if isinstance(c, str) else None))

    if "metadata" in data:
        m = data["metadata"]
        fields.append("metadata = ?")
        values.append(json.dumps(m) if isinstance(m, (dict, list)) else str(m))

    if not fields:
        conn.close()
        return jsonify({"success": True, "message": "No changes specified"})

    fields.append("updated_at = ?")
    values.append(datetime.utcnow().isoformat())
    values.append(provider_id)

    cursor.execute(f"UPDATE providers SET {', '.join(fields)} WHERE id = ?", values)
    conn.commit()

    cursor.execute("SELECT * FROM providers WHERE id = ?", (provider_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({"success": False, "error": "Provider not found"}), 404
    return jsonify({"success": True, "provider": row_to_dict(row)})

@provider_bp.route("/<provider_id>", methods=["DELETE"])
def delete_provider(provider_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    # Delete all files associated with this cloud account
    cursor.execute("DELETE FROM files WHERE provider_id = ?", (provider_id,))
    # Delete the cloud account record
    cursor.execute("DELETE FROM providers WHERE id = ?", (provider_id,))

    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": f"Provider {provider_id} deleted successfully"})

@provider_bp.route("/sync", methods=["POST"])
def sync_providers():
    """Batch synchronizes multiple cloud accounts into the SQLite database."""
    data = request.get_json() or {}
    providers = data.get("providers", [])
    conn = get_db_connection()
    cursor = conn.cursor()

    synced = 0
    now = datetime.utcnow().isoformat()
    for p in providers:
        pid = p.get("id")
        if not pid:
            continue
        
        ptype = p.get("type") or "local_disk"
        name = p.get("name") or "Connected Cloud Storage"
        icon = p.get("icon") or "ph-cloud"
        color = p.get("color") or "#00f2fe"
        status = p.get("status") or "connected"
        user_acc = p.get("user") or p.get("email") or ""
        email = p.get("email") or ""
        if not user_acc or user_acc in generic_placeholders:
            match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", name + " " + email)
            if match:
                user_acc = match.group(0)
                if not email:
                    email = match.group(0)
            else:
                user_acc = user_acc or name or "Cloud Account"
        if not email and "@" in str(user_acc):
            email = user_acc
        region = p.get("region") or "Cloud Server"
        total_gb = float(p.get("totalStorageGB") if p.get("totalStorageGB") is not None else (p.get("total_storage_gb") or 100.0))
        used_gb = float(p.get("usedStorageGB") if p.get("usedStorageGB") is not None else (p.get("used_storage_gb") or 0.0))
        
        creds = p.get("credentials")
        creds_json = json.dumps(creds) if creds and isinstance(creds, (dict, list)) else (creds if isinstance(creds, str) else None)
        
        connected_at = p.get("connectedAt") or p.get("connected_at") or now
        last_sync = p.get("lastSync") or p.get("last_sync") or now
        file_count = int(p.get("fileCount") or p.get("file_count") or 0)
        meta = p.get("metadata") or {}
        meta_json = json.dumps(meta) if isinstance(meta, (dict, list)) else str(meta)

        cursor.execute("SELECT id FROM providers WHERE id = ?", (pid,))
        if cursor.fetchone():
            cursor.execute("""
                UPDATE providers
                SET name = ?, type = ?, icon = ?, color = ?, status = ?,
                    user = ?, email = ?, credentials = ?, total_storage_gb = ?,
                    used_storage_gb = ?, region = ?, connected_at = ?, last_sync = ?,
                    file_count = ?, metadata = ?, updated_at = ?
                WHERE id = ?
            """, (
                name, ptype, icon, color, status,
                user_acc, email, creds_json, total_gb,
                used_gb, region, connected_at, last_sync,
                file_count, meta_json, now, pid
            ))
        else:
            cursor.execute("""
                INSERT INTO providers (
                    id, user_id, name, type, icon, color, status,
                    user, email, credentials, total_storage_gb,
                    used_storage_gb, region, connected_at, last_sync,
                    file_count, metadata, updated_at
                ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pid, name, ptype, icon, color, status,
                user_acc, email, creds_json, total_gb,
                used_gb, region, connected_at, last_sync,
                file_count, meta_json, now
            ))
        synced += 1

    conn.commit()
    conn.close()
    return jsonify({"success": True, "syncedCount": synced})

@provider_bp.route("/summary", methods=["GET"])
def providers_summary():
    """Returns aggregated capacity and count statistics across all connected cloud accounts."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            COUNT(*) as total_clouds,
            COALESCE(SUM(total_storage_gb), 0.0) as total_gb,
            COALESCE(SUM(used_storage_gb), 0.0) as used_gb
        FROM providers
    """)
    totals = cursor.fetchone()

    cursor.execute("""
        SELECT type, COUNT(*) as count, COALESCE(SUM(used_storage_gb), 0.0) as used_gb
        FROM providers
        GROUP BY type
    """)
    by_type = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT COUNT(*) as total_files FROM files")
    files_stat = cursor.fetchone()

    conn.close()

    total_gb = round(totals["total_gb"], 2)
    used_gb = round(totals["used_gb"], 2)
    free_gb = round(max(0.0, total_gb - used_gb), 2)

    return jsonify({
        "success": True,
        "summary": {
            "totalClouds": totals["total_clouds"],
            "totalStorageGB": total_gb,
            "usedStorageGB": used_gb,
            "freeStorageGB": free_gb,
            "totalFiles": files_stat["total_files"] if files_stat else 0,
            "byType": by_type
        }
    })
