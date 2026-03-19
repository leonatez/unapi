"""Export a document's APIs to a Postman Collection v2.1."""
import json
import uuid
from app.core.database import get_db


def export_postman(document_id: str) -> dict:
    db = get_db()
    doc = db.table("api_document").select("*").eq("id", document_id).single().execute().data
    if not doc:
        return {}

    apis = (
        db.table("api")
        .select("*, api_message(*, api_field(*)), flow(document_id)")
        .eq("flow.document_id", document_id)
        .execute()
    ).data or []

    items = []
    for api in apis:
        method = api.get("method") or "POST"
        path = api.get("path") or "/"

        # Build body fields as sample JSON
        req_fields = {}
        for msg in api.get("api_message", []):
            if msg["message_type"] == "request":
                for f in msg.get("api_field", []):
                    if not f.get("parent_field_id"):
                        req_fields[f["name"]] = f.get("default_value") or f.get("data_type") or ""

        item = {
            "name": api["name"],
            "request": {
                "method": method,
                "header": [
                    {"key": "Content-Type", "value": "application/json"},
                    {"key": "Authorization", "value": "Bearer {{access_token}}"},
                ],
                "url": {
                    "raw": f"{{{{base_url}}}}{path}",
                    "host": ["{{base_url}}"],
                    "path": [p for p in path.split("/") if p],
                },
                "body": {
                    "mode": "raw",
                    "raw": json.dumps(req_fields, indent=2),
                    "options": {"raw": {"language": "json"}},
                },
                "description": api.get("description") or "",
            },
        }
        items.append({"id": str(uuid.uuid4()), **item})

    return {
        "info": {
            "_postman_id": str(uuid.uuid4()),
            "name": doc["name"],
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": items,
        "variable": [
            {"key": "base_url", "value": "https://your-host.com"},
            {"key": "access_token", "value": ""},
        ],
    }
