import sqlite3
import json
import logging
from datetime import datetime
from backend.config import DATABASE_PATH

logger = logging.getLogger("omnicloud.database")

def get_db_connection():
    """Returns a SQLite connection with Row factory enabled and WAL mode."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """Initializes tables, migrations, and indexes if they do not exist."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT,
        initials TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # Providers table with complete cloud metadata and credentials storage
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        status TEXT DEFAULT 'connected',
        user TEXT,
        email TEXT,
        credentials TEXT,
        total_storage_gb REAL DEFAULT 100.0,
        used_storage_gb REAL DEFAULT 0.0,
        region TEXT DEFAULT 'Cloud Server',
        connected_at TEXT,
        last_sync TEXT,
        file_count INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Automatic column migration for existing databases
    cursor.execute("PRAGMA table_info(providers);")
    existing_cols = {col["name"] for col in cursor.fetchall()}
    needed_cols = [
        ("user", "TEXT"),
        ("email", "TEXT"),
        ("connected_at", "TEXT"),
        ("last_sync", "TEXT"),
        ("file_count", "INTEGER DEFAULT 0"),
        ("metadata", "TEXT DEFAULT '{}'")
    ]
    for col_name, col_type in needed_cols:
        if col_name not in existing_cols:
            try:
                cursor.execute(f"ALTER TABLE providers ADD COLUMN {col_name} {col_type};")
            except Exception as e:
                logger.warning("Could not add column %s: %s", col_name, e)

    # Files table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        provider_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        mime_type TEXT,
        size_bytes INTEGER DEFAULT 0,
        path TEXT DEFAULT '/',
        starred INTEGER DEFAULT 0,
        encrypted INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        local_storage_path TEXT,
        preview_url TEXT,
        last_modified TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Transfers table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transfers (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        file_id TEXT,
        file_name TEXT NOT NULL,
        source_provider TEXT NOT NULL,
        dest_provider TEXT NOT NULL,
        size_bytes INTEGER DEFAULT 0,
        progress INTEGER DEFAULT 0,
        status TEXT DEFAULT 'in_progress',
        speed_mbps REAL DEFAULT 0.0,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    # Create indexes for fast querying
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_provider ON files(provider_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_providers_type ON providers(type);")

    # Seed default user if none exists
    cursor.execute("SELECT COUNT(*) as cnt FROM users;")
    if cursor.fetchone()["cnt"] == 0:
        cursor.execute("""
            INSERT INTO users (id, email, name, password_hash, initials, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            "user_default_alex",
            "alex.dev@gmail.com",
            "Alex Dev",
            "pbkdf2:sha256:demo_password_hash",
            "AD",
            datetime.utcnow().isoformat()
        ))

    conn.commit()
    conn.close()
    logger.info("Database initialized successfully at %s", DATABASE_PATH)

def row_to_dict(row):
    """Converts a sqlite3.Row to a standard python dict with JSON parsing and camelCase mapping."""
    if row is None:
        return None
    d = dict(row)
    if "tags" in d and isinstance(d["tags"], str):
        try:
            d["tags"] = json.loads(d["tags"])
        except Exception:
            d["tags"] = []
    if "starred" in d:
        d["starred"] = bool(d["starred"])
    if "encrypted" in d:
        d["encrypted"] = bool(d["encrypted"])
    if "credentials" in d and isinstance(d["credentials"], str):
        try:
            d["credentials"] = json.loads(d["credentials"])
        except Exception:
            pass
    if "metadata" in d and isinstance(d["metadata"], str):
        try:
            d["metadata"] = json.loads(d["metadata"])
        except Exception:
            d["metadata"] = {}

    # Map snake_case to camelCase for full frontend interoperability
    if "total_storage_gb" in d:
        d["totalStorageGB"] = float(d["total_storage_gb"] or 0.0)
    if "used_storage_gb" in d:
        d["usedStorageGB"] = float(d["used_storage_gb"] or 0.0)
    if "connected_at" in d:
        d["connectedAt"] = d["connected_at"]
    if "last_sync" in d:
        d["lastSync"] = d["last_sync"]
    if "file_count" in d:
        d["fileCount"] = int(d["file_count"] or 0)

    # Compute free space
    total = d.get("totalStorageGB", 0.0)
    used = d.get("usedStorageGB", 0.0)
    d["freeStorageGB"] = round(max(0.0, total - used), 2)

    # Ensure user and email are extracted intelligently from name or email
    import re
    raw_user = d.get("user")
    raw_email = d.get("email")
    generic_placeholders = ("Google Drive Account", "Cloud Account", "Dropbox Storage Account", "OneDrive Azure Link", "Local Computer Disk Storage")
    if not raw_user or raw_user in generic_placeholders:
        email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", d.get("name", "") + " " + str(raw_email or ""))
        if email_match:
            d["user"] = email_match.group(0)
            if not raw_email or raw_email == "alex.dev@gmail.com":
                d["email"] = email_match.group(0)
        elif not raw_user:
            d["user"] = raw_email or d.get("name") or "Cloud Account"

    return d
