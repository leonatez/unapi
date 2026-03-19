from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db

router = APIRouter()


# ─── Read ──────────────────────────────────────────────────────

@router.get("/")
def list_flows(document_id: str | None = None):
    db = get_db()
    # Include apis (via flow_id) and flow_steps for each flow
    q = db.table("flow").select("*, flow_step(*, api(id, name, method, path, exposed_by)), api(id, name, method, path, exposed_by, confidence_score)")
    if document_id:
        q = q.eq("document_id", document_id)
    return q.order("name").execute().data


@router.get("/{flow_id}")
def get_flow(flow_id: str):
    db = get_db()
    row = (
        db.table("flow")
        .select("*, flow_step(*, api(id, name, method, path, exposed_by)), api(id, name, method, path, exposed_by, confidence_score)")
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

    if flow.get("mermaid_source"):
        return {"mermaid": flow["mermaid_source"]}

    steps = sorted(flow.get("flow_step", []), key=lambda s: s["step_order"])
    lines = ["sequenceDiagram"]
    participants: set = set()

    for step in steps:
        actor_from = step.get("actor_from") or "System"
        actor_to = step.get("actor_to") or "System"
        participants.add(actor_from)
        participants.add(actor_to)

    for p in sorted(participants):
        lines.insert(1, f"    participant {p}")

    for step in steps:
        actor_from = step.get("actor_from") or "System"
        actor_to = step.get("actor_to") or "System"
        label = step.get("label", "")
        step_api = step.get("api")
        if step_api:
            label = f"{step_api.get('method', '')} {step_api.get('path', '')} [{label}]"
        lines.append(f"    {actor_from}->>{actor_to}: {label}")

    mermaid = "\n".join(lines)
    return {"mermaid": mermaid, "flow_id": flow_id}


# ─── Update Flow ───────────────────────────────────────────────

class UpdateFlowBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


@router.patch("/{flow_id}")
def update_flow(flow_id: str, body: UpdateFlowBody):
    db = get_db()
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "Nothing to update")
    row = db.table("flow").update(data).eq("id", flow_id).execute()
    if not row.data:
        raise HTTPException(404, "Flow not found")
    return row.data[0]


# ─── Steps ────────────────────────────────────────────────────

class CreateStepBody(BaseModel):
    label: str
    actor_from: Optional[str] = None
    actor_to: Optional[str] = None
    step_order: Optional[int] = None
    api_id: Optional[str] = None


class UpdateStepBody(BaseModel):
    label: Optional[str] = None
    actor_from: Optional[str] = None
    actor_to: Optional[str] = None
    step_order: Optional[int] = None
    api_id: Optional[str] = None


@router.post("/{flow_id}/steps")
def create_step(flow_id: str, body: CreateStepBody):
    db = get_db()
    # Auto-assign step_order if not given
    if body.step_order is None:
        existing = db.table("flow_step").select("step_order").eq("flow_id", flow_id).execute().data
        next_order = max((s["step_order"] for s in existing), default=0) + 1
    else:
        next_order = body.step_order

    payload = body.model_dump()
    payload["flow_id"] = flow_id
    payload["step_order"] = next_order
    row = db.table("flow_step").insert(payload).execute()
    return row.data[0]


@router.patch("/{flow_id}/steps/{step_id}")
def update_step(flow_id: str, step_id: str, body: UpdateStepBody):
    db = get_db()
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "Nothing to update")
    row = db.table("flow_step").update(data).eq("id", step_id).execute()
    if not row.data:
        raise HTTPException(404, "Step not found")
    return row.data[0]


@router.delete("/{flow_id}/steps/{step_id}", status_code=204)
def delete_step(flow_id: str, step_id: str):
    db = get_db()
    db.table("flow_step").delete().eq("id", step_id).execute()
