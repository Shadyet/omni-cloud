from flask import Blueprint, request, jsonify
from backend.services.transfer_service import TransferService

transfer_bp = Blueprint("transfer_bp", __name__)

@transfer_bp.route("", methods=["GET"])
def get_transfers():
    user_id = request.args.get("userId")
    transfers = TransferService.get_transfers(user_id=user_id)
    return jsonify({"success": True, "transfers": transfers, "count": len(transfers)})

@transfer_bp.route("", methods=["POST"])
def create_transfer():
    data = request.get_json() or {}
    file_id = data.get("fileId")
    source_provider = data.get("sourceProvider")
    dest_provider = data.get("destProvider")

    if not file_id or not source_provider or not dest_provider:
        return jsonify({"success": False, "error": "fileId, sourceProvider, and destProvider are required"}), 400

    if source_provider == dest_provider:
        return jsonify({"success": False, "error": "Source and destination providers must be different"}), 400

    transfer = TransferService.create_transfer(file_id, source_provider, dest_provider)
    return jsonify({"success": True, "transfer": transfer}), 201

@transfer_bp.route("/<transfer_id>", methods=["DELETE"])
def cancel_transfer(transfer_id):
    ok = TransferService.cancel_transfer(transfer_id)
    return jsonify({"success": ok, "message": "Transfer cancelled"})

@transfer_bp.route("/clear", methods=["POST"])
def clear_transfers():
    TransferService.clear_transfers()
    return jsonify({"success": True, "message": "Finished transfers cleared"})
