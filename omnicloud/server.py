#!/usr/bin/env python3
"""
==============================================================================
 OmniCloud - Unified Cloud Storage Hub & Migration Engine
 Python Backend Server (Flask 3.1 + SQLite)
==============================================================================
"""

import sys
import os

# Set UTF-8 encoding for Windows terminals if needed
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Add root directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from backend.config import HOST, PORT, DEBUG, DATABASE_PATH, UPLOAD_DIR
from backend.app import create_app

def print_banner(host, port):
    print("\n" + "=" * 65)
    print("   [OMNICLOUD] PYTHON BACKEND SERVER (v2.0)")
    print("=" * 65)
    print(f"   * Web Application:    http://localhost:{port}/")
    print(f"   * API Root:           http://localhost:{port}/api/")
    print(f"   * Health Check:       http://localhost:{port}/api/system/health")
    print(f"   * SQLite Database:    {DATABASE_PATH}")
    print(f"   * Uploads Directory:  {UPLOAD_DIR}")
    print("=" * 65)
    print("   Press CTRL+C to stop the server\n")

if __name__ == "__main__":
    app = create_app()
    print_banner(HOST, PORT)
    try:
        app.run(host=HOST, port=PORT, debug=DEBUG, use_reloader=False)
    except KeyboardInterrupt:
        print("\n[OMNICLOUD] Server stopped by user.")
    except Exception as e:
        print(f"\n[ERROR] Server error: {e}")
