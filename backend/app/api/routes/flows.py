from fastapi import APIRouter, HTTPException
from app.core.database import get_db

router = APIRouter()


@router.get("/")
def list_flows(document_id: str | None = None):
    db = get_db()
    q = db.table("flow").select("*, flow_step(*)")
    if document_id:
        q = q.eq("document_id", document_id)
    return q.order("name").execute().data


@router.get("/{flow_id}")
def get_flow(flow_id: str):
    db = get_db()
    row = (
        db.table("flow")
        .select("*, flow_step(*, api(id, name, method, path, exposed_by))")
        .eq("id", flow_id)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(404, "Flow not found")
    return row.data


@router.get("/{flow_id}/mermaid")
def get_flow_mermaid(flow_id: str):
    """Generate Mermaid sequence diagram from stored flow steps."""
    db = get_db()
    row = (
        db.table("flow")
        .select("*, flow_step(*, api(name, method, path))")
        .eq("id", flow_id)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(404, "Flow not found")

    flow = row.data

    # If mermaid_source is already stored, return it
    if flow.get("mermaid_source"):
        return {"mermaid": flow["mermaid_source"]}

    # Generate from steps
    steps = sorted(flow.get("flow_step", []), key=lambda s: s["step_order"])
    lines = ["sequenceDiagram"]
    participants = set()

    for step in steps:
        actor_from = step.get("actor_from") or "System"
        actor_to = step.get("actor_to") or "System"
        participants.add(actor_from)
        participants.add(actor_to)

    # Add participants at top
    for p in sorted(participants):
        lines.insert(1, f"    participant {p}")

    for step in steps:
        actor_from = step.get("actor_from") or "System"
        actor_to = step.get("actor_to") or "System"
        label = step.get("label", "")
        api = step.get("api")
        if api:
            label = f"{api.get('method', '')} {api.get('path', '')} [{label}]"
        lines.append(f"    {actor_from}->>{actor_to}: {label}")

    mermaid = "\n".join(lines)
    return {"mermaid": mermaid, "flow_id": flow_id}
