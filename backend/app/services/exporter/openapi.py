"""Export a document's APIs to OpenAPI 3.0 spec."""
from app.core.database import get_db

_TYPE_MAP = {
    "String": "string",
    "Number": "number",
    "Integer": "integer",
    "Boolean": "boolean",
    "Object": "object",
    "Array": "array",
    "Date": "string",
}


def _field_to_schema(field: dict) -> dict:
    oa_type = _TYPE_MAP.get(field.get("data_type") or "", "string")
    schema: dict = {"type": oa_type}
    if field.get("description"):
        schema["description"] = field["description"]
    if field.get("default_value"):
        schema["default"] = field["default_value"]
    if field.get("max_length"):
        schema["maxLength"] = field["max_length"]
    if field.get("is_deprecated"):
        schema["deprecated"] = True
    enums = field.get("api_field_enum", [])
    if enums:
        schema["enum"] = [e["value"] for e in enums]
    return schema


def export_openapi(document_id: str) -> dict:
    db = get_db()
    doc = db.table("api_document").select("*").eq("id", document_id).single().execute().data
    if not doc:
        return {}

    apis = (
        db.table("api")
        .select("*, api_message(*, api_field(*, api_field_enum(*)))")
        .eq("document_id", document_id)
        .execute()
    ).data or []

    paths: dict = {}

    for api in apis:
        path = api.get("path") or f"/{api['name'].lower().replace(' ', '-')}"
        method = (api.get("method") or "POST").lower()

        req_schema_props = {}
        req_required = []
        resp_schema_props = {}

        for msg in api.get("api_message", []):
            for field in msg.get("api_field", []):
                if field.get("parent_field_id"):
                    continue  # skip nested for now
                schema = _field_to_schema(field)
                if msg["message_type"] == "request":
                    req_schema_props[field["name"]] = schema
                    if field.get("is_required"):
                        req_required.append(field["name"])
                else:
                    resp_schema_props[field["name"]] = schema

        operation: dict = {
            "summary": api["name"],
            "description": api.get("description") or "",
            "operationId": api["name"].replace(" ", "_"),
            "tags": [api.get("exposed_by", "API")],
            "responses": {
                "200": {
                    "description": "Success",
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": resp_schema_props,
                            }
                        }
                    },
                }
            },
        }

        if method not in ("get", "delete") and req_schema_props:
            operation["requestBody"] = {
                "required": True,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": req_schema_props,
                            "required": req_required,
                        }
                    }
                },
            }

        if path not in paths:
            paths[path] = {}
        paths[path][method] = operation

    return {
        "openapi": "3.0.0",
        "info": {
            "title": doc["name"],
            "version": doc.get("version") or "1.0.0",
            "description": f"Partner: {doc.get('partner_name')} | Flow: {doc.get('flow_name')}",
        },
        "paths": paths,
        "components": {
            "securitySchemes": {
                "BearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                }
            }
        },
        "security": [{"BearerAuth": []}],
    }
