import os
import io
import json
from datetime import datetime
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, Response
from backend.services.storage_service import StorageService
from backend.database import get_db_connection, row_to_dict

file_bp = Blueprint("file_bp", __name__)

@file_bp.route("", methods=["GET"])
def get_files():
    provider_id = request.args.get("providerId") or request.args.get("provider")
    file_type = request.args.get("type")
    path = request.args.get("path")
    search = request.args.get("search")
    starred_param = request.args.get("starred")
    starred = (starred_param.lower() in ("true", "1")) if starred_param is not None else None

    files = StorageService.get_files(
        provider_id=provider_id,
        file_type=file_type,
        path=path,
        search=search,
        starred=starred
    )
    return jsonify({"success": True, "files": files, "count": len(files)})

@file_bp.route("/<file_id>", methods=["GET"])
def get_file(file_id):
    f = StorageService.get_file_by_id(file_id)
    if not f:
        return jsonify({"success": False, "error": "File not found"}), 404
    return jsonify({"success": True, "file": f})

@file_bp.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part in request"}), 400

    file_obj = request.files["file"]
    if not file_obj or file_obj.filename == "":
        return jsonify({"success": False, "error": "No selected file"}), 400

    provider_id = request.form.get("providerId", "local_disk")
    current_path = request.form.get("path", "/")

    created_file = StorageService.save_uploaded_file(
        file_obj,
        user_id=None,
        provider_id=provider_id,
        current_path=current_path
    )
    return jsonify({"success": True, "file": created_file}), 201

@file_bp.route("/<file_id>/download", methods=["GET"])
def download_file(file_id):
    f = StorageService.get_file_by_id(file_id)
    if not f:
        return jsonify({"success": False, "error": "File not found"}), 404

    # If physical local file exists
    local_path = f.get("local_storage_path")
    if local_path and os.path.exists(local_path):
        return send_file(
            local_path,
            as_attachment=True,
            download_name=f["name"],
            mimetype=f.get("mime_type") or "application/octet-stream"
        )

    # If remote cloud file without local binary, generate a formatted cloud export stream
    content = (
        f"--- OmniCloud Export File ---\n"
        f"Name: {f['name']}\n"
        f"ID: {f['id']}\n"
        f"Provider: {f.get('provider_id')}\n"
        f"Size: {f.get('size_bytes')} bytes\n"
        f"MIME: {f.get('mime_type')}\n"
        f"Last Modified: {f.get('last_modified')}\n"
        f"\n[This is a cloud-synchronized file from provider {f.get('provider_id')}]\n"
    )
    return send_file(
        io.BytesIO(content.encode("utf-8")),
        as_attachment=True,
        download_name=f["name"],
        mimetype="text/plain;charset=utf-8"
    )

@file_bp.route("/<file_id>/preview", methods=["GET"])
def preview_file(file_id):
    f = StorageService.get_file_by_id(file_id)
    if not f:
        return jsonify({"success": False, "error": "File not found"}), 404

    local_path = f.get("local_storage_path")
    if local_path and os.path.exists(local_path):
        return send_file(local_path, mimetype=f.get("mime_type") or "application/octet-stream")

    if f.get("preview_url") and f["preview_url"].startswith("http"):
        return jsonify({"success": True, "external_url": f["preview_url"]})

    return jsonify({"success": False, "error": "No preview available for this file"}), 404

@file_bp.route("/folder", methods=["POST"])
def create_folder():
    data = request.get_json() or {}
    folder_name = data.get("name", "New folder").strip()
    path = data.get("path", "/")
    provider_id = data.get("providerId", "local_disk")

    new_folder = StorageService.create_folder(folder_name, path, provider_id)
    return jsonify({"success": True, "file": new_folder}), 201

@file_bp.route("/<file_id>", methods=["PUT", "PATCH"])
def update_file(file_id):
    data = request.get_json() or {}
    updated = StorageService.update_file(file_id, data)
    if not updated:
        return jsonify({"success": False, "error": "File not found"}), 404
    return jsonify({"success": True, "file": updated})

@file_bp.route("/<file_id>", methods=["DELETE"])
def delete_file(file_id):
    ok = StorageService.delete_file(file_id)
    if not ok:
        return jsonify({"success": False, "error": "File not found"}), 404
    return jsonify({"success": True, "message": "File deleted successfully"})

@file_bp.route("/batch-delete", methods=["POST"])
def batch_delete():
    data = request.get_json() or {}
    file_ids = data.get("fileIds", [])
    deleted_count = 0
    for fid in file_ids:
        if StorageService.delete_file(fid):
            deleted_count += 1
    return jsonify({"success": True, "deletedCount": deleted_count})

@file_bp.route("/batch-move", methods=["POST"])
def batch_move():
    data = request.get_json() or {}
    file_ids = data.get("fileIds", [])
    target_path = data.get("targetPath", "/")
    target_provider = data.get("targetProviderId")
    StorageService.move_files(file_ids, target_path, target_provider)
    return jsonify({"success": True, "movedCount": len(file_ids)})

@file_bp.route("/sync", methods=["POST"])
def sync_files():
    """Batch imports or syncs external cloud files into the SQLite database."""
    data = request.get_json() or {}
    incoming_files = data.get("files", [])
    conn = get_db_connection()
    cursor = conn.cursor()

    imported = 0
    now_iso = datetime.utcnow().isoformat()
    for f in incoming_files:
        fid = f.get("id")
        if not fid:
            continue
        last_mod = f.get("lastModified") or f.get("last_modified") or now_iso
        tags_raw = f.get("tags", [])
        tags_str = json.dumps(tags_raw) if isinstance(tags_raw, (list, dict)) else (str(tags_raw) if tags_raw else "[]")
        pid = f.get("providerId") or f.get("provider_id") or "local_disk"

        cursor.execute("SELECT id FROM files WHERE id = ?", (fid,))
        if cursor.fetchone():
            # Update existing
            cursor.execute("""
                UPDATE files
                SET name = ?, size_bytes = ?, last_modified = ?, tags = ?
                WHERE id = ?
            """, (
                f.get("name", "Untitled"), f.get("sizeBytes", 0),
                last_mod, tags_str, fid
            ))
        else:
            # Insert new
            cursor.execute("""
                INSERT INTO files (
                    id, user_id, provider_id, name, type, mime_type,
                    size_bytes, path, starred, encrypted, tags,
                    local_storage_path, preview_url, last_modified
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                fid, f.get("userId") or f.get("user_id"), pid,
                f.get("name", "Untitled"), f.get("type", "document"),
                f.get("mimeType") or f.get("mime_type") or "application/octet-stream",
                f.get("sizeBytes") or f.get("size_bytes") or 0,
                f.get("path", "/"),
                1 if f.get("starred") else 0, 1 if f.get("encrypted") else 0,
                tags_str, f.get("localStoragePath") or f.get("local_storage_path"),
                f.get("previewUrl") or f.get("preview_url"), last_mod
            ))
            imported += 1

    # Update file count and last_sync for affected providers
    affected_providers = {f.get("providerId") or f.get("provider_id") for f in incoming_files if (f.get("providerId") or f.get("provider_id"))}
    now = datetime.utcnow().isoformat()
    for pid in affected_providers:
        cursor.execute("SELECT COUNT(*) as cnt FROM files WHERE provider_id = ?", (pid,))
        res = cursor.fetchone()
        cnt = res["cnt"] if res else 0
        cursor.execute("UPDATE providers SET file_count = ?, last_sync = ? WHERE id = ?", (cnt, now, pid))

    conn.commit()
    conn.close()
    return jsonify({"success": True, "syncedCount": len(incoming_files), "importedCount": imported})
