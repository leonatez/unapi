from fastapi import APIRouter, HTTPException
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
