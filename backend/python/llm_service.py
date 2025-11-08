import os
import json
import re
from typing import Optional, Dict, Any
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse

import google.generativeai as genai

# Load .env if present
load_dotenv()

GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")

app = FastAPI(title="Python LLM Service", version="1.0.0")

# CORS (adjust FRONTEND_URL if you want to restrict)
FRONTEND_URL = os.getenv("FRONTEND_URL", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL] if FRONTEND_URL != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)


class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None


class ParseRequest(BaseModel):
    message: str
    filePath: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


SYSTEM_COMMAND_PROMPT = (
    "You are an AI video editing assistant that translates natural language commands into structured editing operations.\n"
    "Return ONLY JSON, no extra text.\n\n"
    "Operations: \n"
    "- split: { filePath, startTime, endTime? }\n"
    "- crop: { filePath, x, y, width, height }\n"
    "- speed: { filePath, speed }\n"
    "- volume: { filePath, volumeDb }\n"
    "- text: { filePath, text, x?, y?, fontSize?, fontColor? }\n"
    "- rotate: { filePath, angle }\n"
    "- trim: { filePath, startTime, endTime? }\n"
    "- fade: { filePath, fadeIn?, fadeOut? }\n\n"
    "Time examples: '5s', '1:30', 'from 2s to 10s'.\n"
    "Volume examples: 'reduce by 20%'=>-6dB.\n\n"
    "Example: {\"operation\": \"split\", \"parameters\": {\"startTime\": 70}}\n"
)

CHAT_SYSTEM_PROMPT = (
    "You are an expert AI video editing assistant inside our app. Goals:\n"
    "- Be friendly for greetings (e.g., 'hello how are you').\n"
    "- Give concrete, step-by-step guidance for edits in this app.\n"
    "- Prefer our operations: split, crop, speed, volume, text, rotate, trim, fade.\n"
    "- Keep responses concise (1–4 short sentences).\n"
)


def manual_command_parse(message: str, file_path: Optional[str]):
    lower = message.lower()

    # split/cut
    if "cut" in lower or "split" in lower:
        m = re.search(r"(\d+)\s*(?:seconds?|s)", lower)
        if m:
            return {
                "operation": "split",
                "parameters": {
                    "filePath": file_path,
                    "startTime": int(m.group(1)),
                },
            }

    # volume
    if "volume" in lower or "audio" in lower:
        if "reduce" in lower or "lower" in lower:
            m = re.search(r"(\d+)%", lower)
            if m:
                percent = int(m.group(1))
                db = round(-6 * (percent / 50))
                return {
                    "operation": "volume",
                    "parameters": {"filePath": file_path, "volumeDb": db},
                }
        if "increase" in lower or "higher" in lower:
            m = re.search(r"(\d+)%", lower)
            if m:
                percent = int(m.group(1))
                db = round(4 * (percent / 50))
                return {
                    "operation": "volume",
                    "parameters": {"filePath": file_path, "volumeDb": db},
                }

    # speed
    if "speed" in lower or "slow" in lower or "fast" in lower:
        if "slow" in lower:
            return {"operation": "speed", "parameters": {"filePath": file_path, "speed": 0.5}}
        if "fast" in lower or "speed up" in lower:
            return {"operation": "speed", "parameters": {"filePath": file_path, "speed": 2.0}}

    # text overlay
    m = re.search(r"['\"](.+?)['\"]", message)
    if ("text" in lower or "add text" in lower) and m:
        return {
            "operation": "text",
            "parameters": {"filePath": file_path, "text": m.group(1), "x": 50, "y": 50},
        }

    return None


@app.get("/status")
async def status():
    return {
        "success": True,
        "hasKey": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL,
    }


@app.post("/chat")
async def chat(req: ChatRequest):
    if not req.message:
        return {"success": False, "error": "Message is required"}
    try:
        context_str = json.dumps(req.context or {})
        prompt = f"{CHAT_SYSTEM_PROMPT}\n\nContext: {context_str}\n\nUser: {req.message}\nAssistant:"
        result = model.generate_content(prompt)
        text = (result.text or "").strip()
        if not text:
            text = "I didn’t get a response. Try rephrasing your question or ask for a specific edit."
        return {
            "success": True,
            "response": text,
            "message": text,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        # Friendly fallback, do not error the UI
        fallback = (
            "I’m having trouble reaching the AI service right now. "
            "You can still use toolbar actions (Split, Crop, Speed, Text). Try again in a moment."
        )
        return {
            "success": True,
            "response": fallback,
            "message": fallback,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


@app.post("/parse-command")
async def parse_command(req: ParseRequest):
    if not req.message:
        return {"success": False, "error": "Message is required"}
    try:
        context_str = json.dumps(req.context or {})
        prompt = (
            f"{SYSTEM_COMMAND_PROMPT}\n\n"
            f"User: \"{req.message}\"\nContext: {context_str}\n\nResponse:"
        )
        result = model.generate_content(prompt)
        text = (result.text or "").strip()
        parsed = None
        try:
            parsed = json.loads(text)
        except Exception:
            pass

        if not parsed:
            # manual fallback
            parsed = manual_command_parse(req.message, req.filePath)

        if parsed:
            # ensure filePath is set if available
            if req.filePath and not (parsed.get("parameters") or {}).get("filePath"):
                params = parsed.get("parameters", {})
                params["filePath"] = req.filePath
                parsed["parameters"] = params
            return {
                "success": True,
                "command": parsed,
                "rawResponse": text,
            }
        else:
            return {
                "success": False,
                "error": "Failed to parse command",
                "rawResponse": text,
            }
    except Exception as e:
        # Fallback: attempt manual parse only
        parsed = manual_command_parse(req.message, req.filePath)
        if parsed:
            return {
                "success": True,
                "command": parsed,
                "rawResponse": None,
                "fallback": True,
                "error": str(e),
            }
        return {"success": False, "error": str(e)}


@app.get("/stream-chat")
async def stream_chat(message: str, context: str = "{}"):
    try:
        try:
            ctx = json.loads(context or "{}")
        except Exception:
            ctx = {}
        prompt = f"{CHAT_SYSTEM_PROMPT}\n\nContext: {json.dumps(ctx)}\n\nUser: {message}\nAssistant:"

        def iter_sse():
            try:
                resp = model.generate_content(prompt, stream=True)
                for chunk in resp:
                    text = getattr(chunk, 'text', '') or ''
                    if text:
                        yield f"data: {json.dumps({'delta': text})}\n\n"
                yield "event: done\n"
                yield "data: {}\n\n"
            except Exception as e:
                # graceful end
                yield "event: done\n"
                yield "data: {}\n\n"
        return StreamingResponse(iter_sse(), media_type="text/event-stream", headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        })
    except Exception:
        return StreamingResponse((line for line in ["event: done\n", "data: {}\n\n"]), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("llm_service:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
