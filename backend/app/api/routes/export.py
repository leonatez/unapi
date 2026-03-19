import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from app.services.exporter.postman import export_postman
from app.services.exporter.openapi import export_openapi

router = APIRouter()


@router.get("/{document_id}/postman")
def export_to_postman(document_id: str):
    collection = export_postman(document_id)
    if not collection:
        raise HTTPException(404, "Document not found")
    return JSONResponse(
        content=collection,
        headers={"Content-Disposition": f'attachment; filename="postman_{document_id}.json"'},
    )


@router.get("/{document_id}/openapi")
def export_to_openapi(document_id: str):
    spec = export_openapi(document_id)
    if not spec:
        raise HTTPException(404, "Document not found")
    return spec
