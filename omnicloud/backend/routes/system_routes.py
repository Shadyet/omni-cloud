import os
import sys
import shutil
import platform
import time
from datetime import datetime
from flask import Blueprint, jsonify, request
from backend.config import UPLOAD_DIR, DATABASE_PATH

system_bp = Blueprint("system_bp", __name__)
SERVER_START_TIME = time.time()

@system_bp.route("/health", methods=["GET"])
def health():
    uptime = int(time.time() - SERVER_START_TIME)
    uploads_count = len(list(UPLOAD_DIR.glob("*"))) if UPLOAD_DIR.exists() else 0
    db_size = DATABASE_PATH.stat().st_size if DATABASE_PATH.exists() else 0

    return jsonify({
        "status": "healthy",
        "service": "OmniCloud Python Backend",
        "version": "2.0.0",
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "uptime_seconds": uptime,
        "database": {
            "type": "SQLite 3",
            "path": str(DATABASE_PATH),
            "size_bytes": db_size
        },
        "storage": {
            "upload_dir": str(UPLOAD_DIR),
            "file_count": uploads_count
        },
        "timestamp": datetime.utcnow().isoformat()
    })

@system_bp.route("/storage", methods=["GET"])
def storage_stats():
    total, used, free = shutil.disk_usage(str(UPLOAD_DIR))
    return jsonify({
        "success": True,
        "totalGB": round(total / (1024 ** 3), 2),
        "usedGB": round(used / (1024 ** 3), 2),
        "freeGB": round(free / (1024 ** 3), 2),
        "usedPercent": round((used / total) * 100, 1)
    })

@system_bp.route("/scan-local", methods=["POST"])
def scan_local():
    """Scans local computer drive using Python for real system integration."""
    data = request.get_json() or {}
    target_path = data.get("path") or str(Path.home() / "Documents")
    
    if not os.path.exists(target_path):
        target_path = str(Path.home())

    scanned_files = []
    total_size = 0

    try:
        for entry in os.scandir(target_path):
            if entry.name.startswith("."):
                continue
            is_dir = entry.is_dir()
            size = 0 if is_dir else entry.stat().st_size
            total_size += size

            ext = entry.name.lower().split(".")[-1] if "." in entry.name else ""
            ftype = "folder" if is_dir else ("image" if ext in ["jpg", "png", "webp"] else ("code" if ext in ["py", "js", "html"] else "document"))

            scanned_files.append({
                "id": f"loc_{int(entry.stat().st_mtime)}_{entry.name}",
                "name": entry.name,
                "type": ftype,
                "sizeBytes": size,
                "providerId": "local_disk",
                "path": "/",
                "starred": False,
                "encrypted": False,
                "lastModified": datetime.fromtimestamp(entry.stat().st_mtime).isoformat(),
                "tags": ["Scanned", ftype]
            })
            if len(scanned_files) >= 50:
                break

        total, used, free = shutil.disk_usage(target_path)
        return jsonify({
            "success": True,
            "driveName": os.path.basename(target_path) or target_path,
            "path": target_path,
            "totalStorageGB": round(total / (1024 ** 3), 2),
            "usedStorageGB": round(used / (1024 ** 3), 2),
            "files": scanned_files,
            "scannedCount": len(scanned_files)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
