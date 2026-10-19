import os
from pathlib import Path
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
from backend.config import BASE_DIR, SECRET_KEY, MAX_CONTENT_LENGTH
from backend.database import init_db
from backend.routes.auth_routes import auth_bp
from backend.routes.file_routes import file_bp
from backend.routes.provider_routes import provider_bp
from backend.routes.transfer_routes import transfer_bp
from backend.routes.cloud_proxy_routes import cloud_proxy_bp
from backend.routes.system_routes import system_bp

def create_app():
    # Frontend directory is the root of omnicloud
    frontend_dir = BASE_DIR

    app = Flask(
        __name__,
        static_folder=str(frontend_dir),
        static_url_path=""
    )

    app.config["SECRET_KEY"] = SECRET_KEY
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

    # Enable CORS for frontend flexibility
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

    # Initialize SQLite database
    init_db()

    # Register API blueprints
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(file_bp, url_prefix="/api/files")
    app.register_blueprint(provider_bp, url_prefix="/api/providers")
    app.register_blueprint(transfer_bp, url_prefix="/api/transfers")
    app.register_blueprint(cloud_proxy_bp, url_prefix="/api/cloud")
    app.register_blueprint(system_bp, url_prefix="/api/system")

    # Frontend Static Routes
    @app.route("/")
    def index():
        return send_from_directory(str(frontend_dir), "index.html")

    @app.route("/oauth_callback.html")
    def oauth_callback():
        return send_from_directory(str(frontend_dir), "oauth_callback.html")

    @app.route("/css/<path:filename>")
    def serve_css(filename):
        return send_from_directory(str(frontend_dir / "css"), filename)

    @app.route("/js/<path:filename>")
    def serve_js(filename):
        return send_from_directory(str(frontend_dir / "js"), filename)

    @app.errorhandler(404)
    def not_found(e):
        # If API route, return JSON 404
        from flask import request
        if request.path.startswith("/api/"):
            return jsonify({"success": False, "error": "Endpoint not found", "path": request.path}), 404
        # Otherwise fallback to index.html for SPA routing
        return send_from_directory(str(frontend_dir), "index.html")

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"success": False, "error": "Internal server error", "details": str(e)}), 500

    return app

if __name__ == "__main__":
    from backend.config import HOST, PORT, DEBUG
    app = create_app()
    app.run(host=HOST, port=PORT, debug=DEBUG)
