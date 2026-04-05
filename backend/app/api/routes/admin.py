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
    import asyncio
    import threading
    from fastapi.responses import StreamingResponse
    from app.services.parser.llm_extractor import stream_playground

    file_bytes = await spec_file.read()
    filename = spec_file.filename or "upload"
    selection = json.loads(sheet_selection) if sheet_selection else None
    sequence = json.loads(flow_sequence) if flow_sequence else None

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def producer():
        try:
            for step in stream_playground(file_bytes, filename, selection, sequence):
                asyncio.run_coroutine_threadsafe(queue.put(step), loop).result()
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()

    threading.Thread(target=producer, daemon=True).start()

    async def generate():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
