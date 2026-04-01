import json
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from app.services.parser.prompts_store import list_prompts, update_prompt, get_default

router = APIRouter()


class PromptUpdate(BaseModel):
    value: str


@router.get("/prompts")
def get_prompts():
    return list_prompts()


@router.patch("/prompts/{key}")
def patch_prompt(key: str, body: PromptUpdate):
    try:
        update_prompt(key, body.value)
        return {"status": "ok", "key": key}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/prompts/{key}/reset")
def reset_prompt_to_default(key: str):
    try:
        default = get_default(key)
        update_prompt(key, default)
        return {"status": "ok", "key": key, "value": default}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/playground/run")
async def playground_run(
    spec_file: UploadFile = File(...),
    sheet_selection: str | None = Form(None),
    flow_sequence: str | None = Form(None),
):
    file_bytes = await spec_file.read()
    selection = json.loads(sheet_selection) if sheet_selection else None
    sequence = json.loads(flow_sequence) if flow_sequence else None

    from app.services.parser.llm_extractor import run_playground
    return run_playground(file_bytes, spec_file.filename or "upload", selection, sequence)
