from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.diff_engine import compare_documents
from app.core.database import get_db

router = APIRouter()


class CompareRequest(BaseModel):
    doc_a_id: str  # internal (Monee) document
    doc_b_id: str  # partner (Bank) document


@router.post("/")
async def run_comparison(body: CompareRequest):
    """
    Compare two documents and return diff results.
    doc_a = internal, doc_b = partner.
    """
    diffs = await compare_documents(body.doc_a_id, body.doc_b_id)
    summary = {
        "breaking": sum(1 for d in diffs if d["severity"] == "breaking"),
        "risky": sum(1 for d in diffs if d["severity"] == "risky"),
        "info": sum(1 for d in diffs if d["severity"] == "info"),
        "total": len(diffs),
    }
    return {"summary": summary, "diffs": diffs}


@router.get("/history")
def list_comparisons(doc_a_id: str | None = None, doc_b_id: str | None = None):
    db = get_db()
    q = db.table("diff_result").select("*")
    if doc_a_id:
        q = q.eq("doc_a_id", doc_a_id)
    if doc_b_id:
        q = q.eq("doc_b_id", doc_b_id)
    return q.order("severity").order("created_at", desc=True).execute().data


@router.get("/history/{doc_a_id}/{doc_b_id}/summary")
def comparison_summary(doc_a_id: str, doc_b_id: str):
    db = get_db()
    rows = (
        db.table("diff_result")
        .select("severity")
        .eq("doc_a_id", doc_a_id)
        .eq("doc_b_id", doc_b_id)
        .execute()
    ).data or []

    summary = {"breaking": 0, "risky": 0, "info": 0, "total": len(rows)}
    for r in rows:
        summary[r["severity"]] = summary.get(r["severity"], 0) + 1
    return summary
