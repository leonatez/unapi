"""
Diff engine: compare two api_documents (internal vs partner) field by field.

Severity rules:
  breaking — field removed, type changed, required changed (optional→mandatory)
  risky    — enum changed, default changed, encrypted flag changed,
             required changed (mandatory→optional), constraint changed
  info     — description changed, deprecated flag changed, new optional field added
"""
from app.core.database import get_db
from app.models.canonical import DiffSeverity


def _fetch_doc_apis(db, document_id: str) -> list[dict]:
    rows = (
        db.table("api")
        .select("*, api_message(*, api_field(*, api_field_enum(*)))")
        .eq("document_id", document_id)
        .execute()
    )
    return rows.data or []


def _fetch_errors(db, api_id: str) -> list[dict]:
    rows = (
        db.table("api_error")
        .select("*")
        .eq("api_id", api_id)
        .execute()
    )
    return rows.data or []


def _flatten_fields(messages: list[dict], prefix: str = "") -> dict[str, dict]:
    """Build a flat map of field_path → field dict."""
    result: dict[str, dict] = {}
    for msg in messages:
        msg_prefix = f"{msg['message_type']}"
        for field in msg.get("api_field", []):
            _walk_field(field, f"{msg_prefix}.{field['name']}", result)
    return result


def _walk_field(field: dict, path: str, result: dict):
    result[path] = field
    for child in field.get("api_field", []):
        _walk_field(child, f"{path}.{child['name']}", result)


def _cmp_field(path: str, fa: dict | None, fb: dict | None) -> list[dict]:
    diffs = []

    if fa is None and fb is not None:
        # Field only in partner doc
        sev = DiffSeverity.breaking if fb["is_required"] else DiffSeverity.info
        diffs.append(_diff(path, "presence", None, "present", sev,
                           "Field exists only in partner doc"))
        return diffs

    if fa is not None and fb is None:
        # Field only in internal doc — partner removed it
        diffs.append(_diff(path, "presence", "present", None,
                           DiffSeverity.breaking, "Field missing from partner doc"))
        return diffs

    # Both exist — compare attributes
    if fa["data_type"] != fb["data_type"]:
        diffs.append(_diff(path, "type", fa["data_type"], fb["data_type"],
                           DiffSeverity.breaking, "Data type mismatch"))

    if fa["is_required"] != fb["is_required"]:
        if not fa["is_required"] and fb["is_required"]:
            sev = DiffSeverity.breaking   # became mandatory
        else:
            sev = DiffSeverity.risky      # became optional
        diffs.append(_diff(path, "required", fa["is_required"], fb["is_required"], sev))

    if fa["max_length"] != fb["max_length"]:
        diffs.append(_diff(path, "max_length", fa["max_length"], fb["max_length"],
                           DiffSeverity.risky, "Max length changed"))

    if fa["default_value"] != fb["default_value"]:
        diffs.append(_diff(path, "default_value", fa["default_value"],
                           fb["default_value"], DiffSeverity.risky))

    if fa["constraints"] != fb["constraints"]:
        diffs.append(_diff(path, "constraints", fa["constraints"],
                           fb["constraints"], DiffSeverity.risky))

    if fa["is_encrypted"] != fb["is_encrypted"]:
        diffs.append(_diff(path, "is_encrypted", fa["is_encrypted"],
                           fb["is_encrypted"], DiffSeverity.risky,
                           "Encryption flag changed"))

    if fa["is_deprecated"] != fb["is_deprecated"]:
        diffs.append(_diff(path, "is_deprecated", fa["is_deprecated"],
                           fb["is_deprecated"], DiffSeverity.info))

    # Enum comparison
    enums_a = {e["value"] for e in fa.get("api_field_enum", [])}
    enums_b = {e["value"] for e in fb.get("api_field_enum", [])}
    if enums_a != enums_b:
        diffs.append(_diff(path, "enum",
                           sorted(enums_a), sorted(enums_b),
                           DiffSeverity.risky, "Enum values changed"))

    return diffs


def _cmp_errors(api_name: str, errors_a: list[dict], errors_b: list[dict]) -> list[dict]:
    diffs = []
    map_a = {(e.get("result_status"), e.get("result_code")): e for e in errors_a}
    map_b = {(e.get("result_status"), e.get("result_code")): e for e in errors_b}

    for key in set(map_a) | set(map_b):
        ea = map_a.get(key)
        eb = map_b.get(key)
        path = f"error.{key[0]}.{key[1]}"
        if ea and not eb:
            diffs.append(_diff(path, "presence", "present", None,
                               DiffSeverity.risky, f"Error code in internal but not partner ({api_name})"))
        elif eb and not ea:
            diffs.append(_diff(path, "presence", None, "present",
                               DiffSeverity.info, f"New error code in partner doc ({api_name})"))
        elif ea and eb and ea.get("result_message") != eb.get("result_message"):
            diffs.append(_diff(path, "result_message",
                               ea.get("result_message"), eb.get("result_message"),
                               DiffSeverity.info))
    return diffs


def _diff(path: str, aspect: str, val_a, val_b,
          severity: DiffSeverity, notes: str = "") -> dict:
    return {
        "field_path": path,
        "aspect": aspect,
        "value_a": str(val_a) if val_a is not None else None,
        "value_b": str(val_b) if val_b is not None else None,
        "severity": severity.value,
        "notes": notes,
    }


async def compare_documents(doc_a_id: str, doc_b_id: str) -> list[dict]:
    """
    Compare two documents. doc_a = internal (Monee), doc_b = partner (Bank).
    Returns list of diff records and persists them to diff_result table.
    """
    db = get_db()
    apis_a = _fetch_doc_apis(db, doc_a_id)
    apis_b = _fetch_doc_apis(db, doc_b_id)

    # Index by name (case-insensitive)
    index_a = {a["name"].lower(): a for a in apis_a}
    index_b = {a["name"].lower(): a for a in apis_b}

    all_diffs: list[dict] = []
    seen_apis = set()

    for name, api_a in index_a.items():
        seen_apis.add(name)
        api_b = index_b.get(name)

        if api_b is None:
            all_diffs.append(_diff(f"api.{name}", "presence", "present", None,
                                   DiffSeverity.breaking, "API exists in internal doc but not in partner doc"))
            continue

        # Compare fields
        fields_a = _flatten_fields(api_a.get("api_message", []))
        fields_b = _flatten_fields(api_b.get("api_message", []))

        for path in set(fields_a) | set(fields_b):
            fa = fields_a.get(path)
            fb = fields_b.get(path)
            diffs = _cmp_field(path, fa, fb)
            for d in diffs:
                d["api_name"] = api_a["name"]
                all_diffs.append(d)

        # Compare errors
        errors_a = _fetch_errors(db, api_a["id"])
        errors_b = _fetch_errors(db, api_b["id"])
        err_diffs = _cmp_errors(api_a["name"], errors_a, errors_b)
        for d in err_diffs:
            d["api_name"] = api_a["name"]
            all_diffs.append(d)

        # Compare method / path
        if api_a["method"] != api_b["method"]:
            all_diffs.append(_diff(f"api.{name}.method",
                                   "method", api_a["method"], api_b["method"],
                                   DiffSeverity.breaking, "HTTP method differs"))
        if api_a["path"] != api_b["path"]:
            all_diffs.append(_diff(f"api.{name}.path",
                                   "path", api_a["path"], api_b["path"],
                                   DiffSeverity.breaking, "API path differs"))

    # APIs in partner but not internal
    for name in index_b:
        if name not in seen_apis:
            all_diffs.append(_diff(f"api.{name}", "presence", None, "present",
                                   DiffSeverity.info, "API in partner doc not in internal doc"))

    # Persist to DB
    if all_diffs:
        rows = [
            {
                "doc_a_id": doc_a_id,
                "doc_b_id": doc_b_id,
                "api_name": d.get("api_name"),
                "field_path": d["field_path"],
                "aspect": d["aspect"],
                "value_a": d["value_a"],
                "value_b": d["value_b"],
                "severity": d["severity"],
                "notes": d.get("notes"),
            }
            for d in all_diffs
        ]
        db.table("diff_result").insert(rows).execute()

    return all_diffs
