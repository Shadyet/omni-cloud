import requests
from flask import Blueprint, request, jsonify

cloud_proxy_bp = Blueprint("cloud_proxy_bp", __name__)

@cloud_proxy_bp.route("/gdrive/quota", methods=["POST"])
def gdrive_quota():
    data = request.get_json() or {}
    token = data.get("token") or request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token or token.startswith("mock_"):
        return jsonify({
            "success": True,
            "totalStorageGB": 15.0,
            "usedStorageGB": 3.82,
            "user": "Google Drive User",
            "region": "Google Cloud (Global)"
        })

    try:
        res = requests.get(
            "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if not res.ok:
            return jsonify({"success": False, "error": res.text, "status_code": res.status_code}), res.status_code

        data = res.json()
        quota = data.get("storageQuota", {})
        limit = int(quota.get("limit") or (15 * 1024 * 1024 * 1024))
        usage = int(quota.get("usage") or quota.get("usageInDrive") or 0)

        total_gb = round(limit / (1024 ** 3), 2)
        used_gb = round(usage / (1024 ** 3), 3)
        user_email = data.get("user", {}).get("emailAddress") or data.get("user", {}).get("displayName") or "Google User"

        return jsonify({
            "success": True,
            "totalStorageGB": total_gb,
            "usedStorageGB": used_gb,
            "usedBytes": usage,
            "totalBytes": limit,
            "user": user_email,
            "region": "Google Cloud (Global)"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@cloud_proxy_bp.route("/gdrive/files", methods=["POST"])
def gdrive_files():
    data = request.get_json() or {}
    token = data.get("token") or request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    provider_id = data.get("providerId", "gdrive")

    if not token or token.startswith("mock_"):
        return jsonify({"success": True, "files": []})

    try:
        fields = "files(id,name,mimeType,size,starred,modifiedTime,thumbnailLink,webContentLink,parents)"
        res = requests.get(
            f"https://www.googleapis.com/drive/v3/files?pageSize=100&fields={fields}&q=trashed=false",
            headers={"Authorization": f"Bearer {token}"},
            timeout=12
        )
        if not res.ok:
            return jsonify({"success": False, "error": res.text}), res.status_code

        res_data = res.json()
        raw_files = res_data.get("files", [])
        return jsonify({"success": True, "files": raw_files})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@cloud_proxy_bp.route("/dropbox/quota", methods=["POST"])
def dropbox_quota():
    data = request.get_json() or {}
    token = data.get("token") or request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token or token.startswith("mock_"):
        return jsonify({
            "success": True,
            "totalStorageGB": 2.0,
            "usedStorageGB": 0.45,
            "user": "Dropbox Account",
            "region": "Dropbox Cloud (US)"
        })

    try:
        res = requests.post(
            "https://api.dropboxapi.com/2/users/get_space_usage",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if not res.ok:
            return jsonify({"success": False, "error": res.text}), res.status_code

        data = res.json()
        used = data.get("used", 0)
        allocation = data.get("allocation", {})
        allocated = allocation.get("allocated", 2 * 1024 * 1024 * 1024)

        return jsonify({
            "success": True,
            "totalStorageGB": round(allocated / (1024 ** 3), 2),
            "usedStorageGB": round(used / (1024 ** 3), 3),
            "user": "Dropbox Pro User",
            "region": "Dropbox Cloud (US)"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@cloud_proxy_bp.route("/onedrive/quota", methods=["POST"])
def onedrive_quota():
    data = request.get_json() or {}
    token = data.get("token") or request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token or token.startswith("mock_"):
        return jsonify({
            "success": True,
            "totalStorageGB": 5.0,
            "usedStorageGB": 1.25,
            "user": "OneDrive User",
            "region": "Microsoft Azure (Global)"
        })

    try:
        res = requests.get(
            "https://graph.microsoft.com/v1.0/me/drive",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if not res.ok:
            return jsonify({"success": False, "error": res.text}), res.status_code

        data = res.json()
        quota = data.get("quota", {})
        total = quota.get("total", 5 * 1024 * 1024 * 1024)
        used = quota.get("used", 0)
        user_name = data.get("owner", {}).get("user", {}).get("displayName") or "Microsoft 365 User"

        return jsonify({
            "success": True,
            "totalStorageGB": round(total / (1024 ** 3), 2),
            "usedStorageGB": round(used / (1024 ** 3), 3),
            "user": user_name,
            "region": "Microsoft Azure (Global)"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
