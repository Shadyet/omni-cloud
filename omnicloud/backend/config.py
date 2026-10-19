import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
DATA_DIR = BACKEND_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DATABASE_PATH = DATA_DIR / "omnicloud.db"

# Ensure runtime directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Server Config
HOST = os.environ.get("OMNICLOUD_HOST", "0.0.0.0")
PORT = int(os.environ.get("OMNICLOUD_PORT", 5000))
DEBUG = os.environ.get("OMNICLOUD_DEBUG", "False").lower() in ("true", "1")
SECRET_KEY = os.environ.get("OMNICLOUD_SECRET_KEY", "omnicloud-super-secret-key-2026")

# File Upload Limits
MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # 500 MB
