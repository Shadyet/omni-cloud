import os
import json
import uuid
import mimetypes
from datetime import datetime
from pathlib import Path
from werkzeug.utils import secure_filename
from backend.config import UPLOAD_DIR
from backend.database import get_db_connection, row_to_dict

class StorageService:
    @staticmethod
    def detect_file_type(filename: str, mime_type: str = "") -> str:
        ext = filename.lower().split(".")[-1] if "." in filename else ""
        if mime_type.startswith("image/") or ext in ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"]:
            return "image"
        if mime_type.startswith("video/") or ext in ["mp4", "mkv", "avi", "mov", "webm", "flv"]:
            return "video"
        if mime_type.startswith("audio/") or ext in ["mp3", "wav", "flac", "ogg", "m4a", "aac"]:
            return "audio"
        if ext in ["js", "py", "html", "css", "json", "ts", "jsx", "tsx", "c", "cpp", "java", "sh", "bat", "yml", "yaml", "xml", "sql"]:
            return "code"
        if ext in ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"]:
            return "archive"
        return "document"

    @staticmethod
    def get_files(user_id=None, provider_id=None, file_type=None, path=None, search=None, starred=None):
        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM files WHERE 1=1"
        params = []

        if user_id:
            query += " AND (user_id = ? OR user_id IS NULL)"
            params.append(user_id)

        if provider_id and provider_id != "all":
            query += " AND provider_id = ?"
            params.append(provider_id)

        if file_type and file_type != "all":
            if file_type == "starred":
                query += " AND starred = 1"
            elif file_type == "encrypted":
                query += " AND encrypted = 1"
            else:
                query += " AND type = ?"
                params.append(file_type)

        if starred is not None:
            query += " AND starred = ?"
            params.append(1 if starred else 0)

        if search:
            query += " AND (LOWER(name) LIKE ? OR tags LIKE ?)"
            s = f"%{search.lower()}%"
            params.extend([s, s])

        # If path provided and not searching globally
        if path and not search and (not file_type or file_type == "all"):
            norm_path = path if path.endswith("/") else path + "/"
            query += " AND (path = ? OR path = ?)"
            params.extend([norm_path, norm_path.rstrip("/")])

        query += " ORDER BY (CASE WHEN type = 'folder' THEN 0 ELSE 1 END), last_modified DESC"

        cursor.execute(query, params)
        rows = cursor.fetchall()
        files = [row_to_dict(r) for r in rows]
        conn.close()
        return files

    @staticmethod
    def get_file_by_id(file_id: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM files WHERE id = ?", (file_id,))
        row = cursor.fetchone()
        conn.close()
        return row_to_dict(row)

    @staticmethod
    def save_uploaded_file(file_storage, user_id=None, provider_id="local_disk", current_path="/"):
        filename = secure_filename(file_storage.filename) or f"upload_{uuid.uuid4().hex[:8]}"
        file_id = f"upload_{int(datetime.utcnow().timestamp() * 1000)}_{uuid.uuid4().hex[:6]}"
        
        # Determine MIME and type
        mime_type = file_storage.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        file_type = StorageService.detect_file_type(filename, mime_type)

        # Save physical file to disk
        local_filename = f"{file_id}_{filename}"
        local_path = UPLOAD_DIR / local_filename
        file_storage.save(str(local_path))
        
        file_size = local_path.stat().st_size
        norm_path = current_path if current_path.endswith("/") else current_path + "/"

        preview_url = f"/api/files/{file_id}/preview" if file_type in ("image", "code") else None
        tags = json.dumps(["Uploaded", file_type])

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO files (
                id, user_id, provider_id, name, type, mime_type,
                size_bytes, path, starred, encrypted, tags,
                local_storage_path, preview_url, last_modified
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
        """, (
            file_id, user_id, provider_id, filename, file_type, mime_type,
            file_size, norm_path, tags, str(local_path), preview_url,
            datetime.utcnow().isoformat()
        ))

        # Update provider used storage
        cursor.execute("""
            UPDATE providers
            SET used_storage_gb = used_storage_gb + ?
            WHERE id = ?
        """, (file_size / (1024 ** 3), provider_id))

        conn.commit()
        conn.close()

        return StorageService.get_file_by_id(file_id)

    @staticmethod
    def create_folder(folder_name: str, path: str = "/", provider_id: str = "local_disk", user_id=None):
        folder_id = f"folder_{int(datetime.utcnow().timestamp() * 1000)}_{uuid.uuid4().hex[:5]}"
        norm_path = path if path.endswith("/") else path + "/"

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO files (
                id, user_id, provider_id, name, type, mime_type,
                size_bytes, path, starred, encrypted, tags,
                local_storage_path, preview_url, last_modified
            ) VALUES (?, ?, ?, ?, 'folder', 'application/vnd.google-apps.folder', 0, ?, 0, 0, '["Folder"]', NULL, NULL, ?)
        """, (
            folder_id, user_id, provider_id, folder_name, norm_path,
            datetime.utcnow().isoformat()
        ))
        conn.commit()
        conn.close()

        return StorageService.get_file_by_id(folder_id)

    @staticmethod
    def update_file(file_id: str, updates: dict):
        allowed = {"name", "path", "starred", "encrypted", "provider_id", "tags"}
        fields = []
        values = []
        for k, v in updates.items():
            if k in allowed:
                fields.append(f"{k} = ?")
                if k in ("starred", "encrypted"):
                    values.append(1 if v else 0)
                elif k == "tags" and isinstance(v, list):
                    values.append(json.dumps(v))
                else:
                    values.append(v)

        if not fields:
            return StorageService.get_file_by_id(file_id)

        fields.append("last_modified = ?")
        values.append(datetime.utcnow().isoformat())
        values.append(file_id)

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(f"UPDATE files SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
        conn.close()

        return StorageService.get_file_by_id(file_id)

    @staticmethod
    def delete_file(file_id: str):
        target = StorageService.get_file_by_id(file_id)
        if not target:
            return False

        # If it's a physical local file, remove it from disk
        if target.get("local_storage_path"):
            try:
                p = Path(target["local_storage_path"])
                if p.exists():
                    p.unlink()
            except Exception as e:
                pass

        conn = get_db_connection()
        cursor = conn.cursor()

        # Deduct used storage from provider
        if target.get("size_bytes") and target.get("provider_id"):
            gb = target["size_bytes"] / (1024 ** 3)
            cursor.execute("""
                UPDATE providers
                SET used_storage_gb = MAX(0.0, used_storage_gb - ?)
                WHERE id = ?
            """, (gb, target["provider_id"]))

        # Also delete children if this was a folder
        if target.get("type") == "folder":
            folder_path = (target.get("path") or "/") + target["name"] + "/"
            cursor.execute("DELETE FROM files WHERE path LIKE ?", (f"{folder_path}%",))

        cursor.execute("DELETE FROM files WHERE id = ?", (file_id,))
        conn.commit()
        conn.close()
        return True

    @staticmethod
    def move_files(file_ids: list, target_path: str, target_provider_id: str = None):
        norm_path = target_path if target_path.endswith("/") else target_path + "/"
        conn = get_db_connection()
        cursor = conn.cursor()

        now = datetime.utcnow().isoformat()
        for fid in file_ids:
            if target_provider_id:
                cursor.execute("""
                    UPDATE files
                    SET path = ?, provider_id = ?, last_modified = ?
                    WHERE id = ?
                """, (norm_path, target_provider_id, now, fid))
            else:
                cursor.execute("""
                    UPDATE files
                    SET path = ?, last_modified = ?
                    WHERE id = ?
                """, (norm_path, now, fid))

        conn.commit()
        conn.close()
        return True
