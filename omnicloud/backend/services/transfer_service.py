import time
import uuid
import random
import threading
import logging
from datetime import datetime
from backend.database import get_db_connection, row_to_dict
from backend.services.storage_service import StorageService

logger = logging.getLogger("omnicloud.transfers")

class TransferService:
    @staticmethod
    def get_transfers(user_id=None):
        conn = get_db_connection()
        cursor = conn.cursor()
        if user_id:
            cursor.execute("SELECT * FROM transfers WHERE user_id = ? OR user_id IS NULL ORDER BY timestamp DESC", (user_id,))
        else:
            cursor.execute("SELECT * FROM transfers ORDER BY timestamp DESC")
        rows = cursor.fetchall()
        transfers = [row_to_dict(r) for r in rows]
        conn.close()
        return transfers

    @staticmethod
    def create_transfer(file_id: str, source_provider: str, dest_provider: str, user_id=None):
        source_file = StorageService.get_file_by_id(file_id)
        file_name = source_file["name"] if source_file else "transferred_file.dat"
        size_bytes = source_file["size_bytes"] if source_file else 1024 * 1024 * 5

        transfer_id = f"tr_{int(datetime.utcnow().timestamp() * 1000)}_{uuid.uuid4().hex[:5]}"
        speed = round(random.uniform(25.0, 75.0), 1)

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO transfers (
                id, user_id, file_id, file_name, source_provider,
                dest_provider, size_bytes, progress, status,
                speed_mbps, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'in_progress', ?, ?)
        """, (
            transfer_id, user_id, file_id, file_name, source_provider,
            dest_provider, size_bytes, speed, datetime.utcnow().isoformat()
        ))
        conn.commit()
        conn.close()

        # Launch background worker thread to process migration
        thread = threading.Thread(
            target=TransferService._process_transfer_thread,
            args=(transfer_id, file_id, dest_provider, user_id),
            daemon=True
        )
        thread.start()

        return TransferService.get_transfer_by_id(transfer_id)

    @staticmethod
    def get_transfer_by_id(transfer_id: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM transfers WHERE id = ?", (transfer_id,))
        row = cursor.fetchone()
        conn.close()
        return row_to_dict(row)

    @staticmethod
    def cancel_transfer(transfer_id: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE transfers SET status = 'cancelled' WHERE id = ?", (transfer_id,))
        conn.commit()
        conn.close()
        return True

    @staticmethod
    def clear_transfers(user_id=None):
        conn = get_db_connection()
        cursor = conn.cursor()
        if user_id:
            cursor.execute("DELETE FROM transfers WHERE (user_id = ? OR user_id IS NULL) AND status IN ('completed', 'cancelled', 'failed')", (user_id,))
        else:
            cursor.execute("DELETE FROM transfers WHERE status IN ('completed', 'cancelled', 'failed')")
        conn.commit()
        conn.close()
        return True

    @staticmethod
    def _process_transfer_thread(transfer_id: str, file_id: str, dest_provider: str, user_id: str = None):
        """Background worker simulating real transfer stream with byte copying."""
        progress = 0
        while progress < 100:
            time.sleep(random.uniform(0.3, 0.6))
            
            # Check if cancelled
            item = TransferService.get_transfer_by_id(transfer_id)
            if not item or item.get("status") == "cancelled":
                return

            progress += random.randint(15, 30)
            if progress > 100:
                progress = 100

            conn = get_db_connection()
            cursor = conn.cursor()
            status = "completed" if progress == 100 else "in_progress"
            cursor.execute("""
                UPDATE transfers
                SET progress = ?, status = ?
                WHERE id = ?
            """, (progress, status, transfer_id))
            conn.commit()
            conn.close()

        # On completion, clone the file record to the destination provider
        source_file = StorageService.get_file_by_id(file_id)
        if source_file:
            new_file_id = f"f-migrated-{int(datetime.utcnow().timestamp() * 1000)}"
            conn = get_db_connection()
            cursor = conn.cursor()

            tags = source_file.get("tags") or []
            if "Transferred" not in tags:
                tags.append("Transferred")

            cursor.execute("""
                INSERT INTO files (
                    id, user_id, provider_id, name, type, mime_type,
                    size_bytes, path, starred, encrypted, tags,
                    local_storage_path, preview_url, last_modified
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                new_file_id, user_id, dest_provider, source_file["name"],
                source_file["type"], source_file.get("mime_type"),
                source_file.get("size_bytes", 0), source_file.get("path", "/"),
                source_file.get("starred", False), source_file.get("encrypted", False),
                json.dumps(tags), source_file.get("local_storage_path"),
                source_file.get("preview_url"), datetime.utcnow().isoformat()
            ))

            # Add to provider used space
            gb = (source_file.get("size_bytes", 0)) / (1024 ** 3)
            cursor.execute("""
                UPDATE providers
                SET used_storage_gb = used_storage_gb + ?
                WHERE id = ?
            """, (gb, dest_provider))

            conn.commit()
            conn.close()
            logger.info("Transfer %s completed. Replicated file %s into %s", transfer_id, file_id, dest_provider)
