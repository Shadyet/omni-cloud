import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, session
from backend.database import get_db_connection, row_to_dict

auth_bp = Blueprint("auth_bp", __name__)

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email:
        return jsonify({"success": False, "error": "Email is required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (email,))
    user_row = cursor.fetchone()

    if not user_row:
        # Auto-create if not found to provide seamless developer/demo experience
        user_id = f"user_{uuid.uuid4().hex[:8]}"
        name = email.split("@")[0].replace(".", " ").replace("-", " ").title()
        initials = "".join([part[0].upper() for part in name.split()[:2]]) or "U"
        cursor.execute("""
            INSERT INTO users (id, email, name, password_hash, initials, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, email, name, "hashed_demo", initials, datetime.utcnow().isoformat()))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()

    user = row_to_dict(user_row)
    conn.close()

    session["user_id"] = user["id"]
    return jsonify({
        "success": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "initials": user["initials"]
        },
        "token": f"bearer_{user['id']}"
    })

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    name = data.get("name", "").strip()
    password = data.get("password", "")

    if not email or not name:
        return jsonify({"success": False, "error": "Name and email are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (email,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "error": "Email already in use"}), 409

    user_id = f"user_{uuid.uuid4().hex[:8]}"
    initials = "".join([part[0].upper() for part in name.split()[:2]]) or "OC"

    cursor.execute("""
        INSERT INTO users (id, email, name, password_hash, initials, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user_id, email, name, "hashed_demo", initials, datetime.utcnow().isoformat()))
    conn.commit()

    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = row_to_dict(cursor.fetchone())
    conn.close()

    session["user_id"] = user["id"]
    return jsonify({
        "success": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "initials": user["initials"]
        },
        "token": f"bearer_{user['id']}"
    })

@auth_bp.route("/me", methods=["GET"])
def me():
    user_id = session.get("user_id")
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer bearer_"):
        user_id = auth_header.replace("Bearer bearer_", "").strip()

    conn = get_db_connection()
    cursor = conn.cursor()
    if user_id:
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    else:
        cursor.execute("SELECT * FROM users LIMIT 1")
    user_row = cursor.fetchone()
    conn.close()

    if not user_row:
        return jsonify({"success": False, "authenticated": False, "user": None}), 200

    user = row_to_dict(user_row)
    return jsonify({
        "success": True,
        "authenticated": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "initials": user["initials"]
        }
    })

@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.pop("user_id", None)
    return jsonify({"success": True, "message": "Logged out successfully"})
