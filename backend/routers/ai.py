"""
routers/ai.py — AI-powered air quality analysis via NVIDIA NIM (minimax-m3.1-flash),
Google Gemini, or Pollinations Free AI.

Routes:
    GET  /ai/health  — check active model and token-saving limits
    POST /ai/analyze — send AQI + pollutant data and return structured advice
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

try:
    import httpx  # type: ignore
except ImportError:
    httpx = None  # type: ignore

try:
    import google.generativeai as genai  # type: ignore
except ImportError:
    genai = None  # type: ignore

try:
    from fastapi import APIRouter, HTTPException, Request  # type: ignore
except ImportError:
    class HTTPException(Exception):
        def __init__(self, status_code: int = 500, detail: str = ""):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class Request:
        client: Any = None

    class APIRouter:
        def __init__(self, prefix: str = "", tags: Optional[list] = None):
            self.prefix = prefix
            self.tags = tags or []

        def get(self, path: str, **kwargs: Any):
            return lambda fn: fn

        def post(self, path: str, **kwargs: Any):
            return lambda fn: fn

try:
    from dotenv import load_dotenv  # type: ignore
except ImportError:
    def load_dotenv(*args: Any, **kwargs: Any) -> bool:  # type: ignore
        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())
            return True
        return False

try:
    from models import AIAnalyzeRequest, AIAnalyzeResponse  # type: ignore
except ImportError:
    from backend.models import AIAnalyzeRequest, AIAnalyzeResponse

load_dotenv()

router = APIRouter(prefix="/ai", tags=["AI Analysis"])

# * Configure NVIDIA NIM & Gemini SDK once at import time
NVIDIA_API_KEY: str = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_MODEL: str = os.getenv("NVIDIA_MODEL", "minimaxai/minimax-m3.1-flash")
_NVIDIA_READY: bool = bool(NVIDIA_API_KEY)

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
_GEMINI_READY: bool = bool(genai is not None and GEMINI_API_KEY and GEMINI_API_KEY != "your-gemini-api-key-here")
if _GEMINI_READY and genai is not None:
    genai.configure(api_key=GEMINI_API_KEY)

# * Model selection & strict token/accuracy controls
MODEL_NAME = NVIDIA_MODEL if _NVIDIA_READY else os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
MAX_QUERY_CHARS = 220
MAX_OUTPUT_TOKENS = 260
TEMPERATURE = 0.15
CACHE_TTL_SECONDS = 600
MIN_COOLDOWN_SECONDS = 3.0
MAX_CALLS_PER_MINUTE = 10

# * In-memory TTL cache & rate-limit trackers (reduces token consumption)
_AI_CACHE: Dict[str, Tuple[float, AIAnalyzeResponse]] = {}
_CLIENT_TIMESTAMPS: Dict[str, list] = {}


def _cache_key(req: AIAnalyzeRequest) -> str:
    """Build deterministic cache key rounded to nearest 5 AQI to maximize cache hits."""
    q = (req.extra_context or "").strip().lower()[:MAX_QUERY_CHARS]
    bucket_aqi = int(round(req.aqi / 5.0) * 5)
    raw = f"{req.city.strip().lower()}|{bucket_aqi}|{q}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _enforce_rate_limit(client_ip: str) -> None:
    now = time.time()
    history = [ts for ts in _CLIENT_TIMESTAMPS.get(client_ip, []) if now - ts < 60.0]
    if history and (now - history[-1]) < MIN_COOLDOWN_SECONDS:
        raise HTTPException(
            status_code=429,
            detail=f"Cooldown active: wait {MIN_COOLDOWN_SECONDS:.0f}s between AI requests to conserve tokens.",
        )
    if len(history) >= MAX_CALLS_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit reached ({MAX_CALLS_PER_MINUTE} AI requests/min). Try again shortly.",
        )
    history.append(now)
    _CLIENT_TIMESTAMPS[client_ip] = history


def _build_prompt(req: AIAnalyzeRequest) -> str:
    """Compact, low-token, strictly grounded prompt."""
    parts = []
    if req.pm25 is not None:
        parts.append(f"PM2.5={req.pm25}")
    if req.pm10 is not None:
        parts.append(f"PM10={req.pm10}")
    if req.o3 is not None:
        parts.append(f"O3={req.o3}")
    if req.no2 is not None:
        parts.append(f"NO2={req.no2}")
    if req.so2 is not None:
        parts.append(f"SO2={req.so2}")
    if req.co is not None:
        parts.append(f"CO={req.co}")

    pollutant_line = ", ".join(parts) if parts else "none"
    query = (req.extra_context or "General exposure guidance").strip()[:MAX_QUERY_CHARS]

    return (
        f"Role: Precise air-quality advisor. Cite ONLY provided numbers; never invent routes or stats.\n"
        f"Data: City={req.city}; AQI={req.aqi}; {pollutant_line} ug/m3.\n"
        f"UserQ: {query}\n"
        f'Return strict JSON only: {{"summary":"<=30 words","health_advice":"<=35 words","recommendations":["<=12 words","<=12 words","<=12 words"]}}'
    )


def _parse_ai_response(text: str) -> dict:
    """Parse JSON from AI response text, stripping optional markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "summary": "Unable to parse AI response. Please try again.",
            "health_advice": "Check official sources for health guidance at this AQI level.",
            "recommendations": [
                "Limit prolonged outdoor exertion",
                "Keep windows closed",
                "Use air purifiers if available",
            ],
        }


async def _post_json(url: str, payload: dict, headers: Optional[dict] = None) -> Tuple[int, dict]:
    """Post JSON using httpx if available, otherwise standard-library urllib."""
    req_headers = {"Content-Type": "application/json", **(headers or {})}
    if httpx is not None:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, headers=req_headers, json=payload)
            return resp.status_code, resp.json() if resp.status_code == 200 else {}

    def _sync_post() -> Tuple[int, dict]:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=req_headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            return err.code, {}

    return await asyncio.to_thread(_sync_post)


@router.get("/health")
async def ai_health():
    """Verify AI model readiness and token-restriction configuration."""
    return {
        "nvidia_configured": _NVIDIA_READY,
        "nvidia_model": NVIDIA_MODEL,
        "gemini_configured": _GEMINI_READY,
        "model": MODEL_NAME,
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "temperature": TEMPERATURE,
        "max_query_chars": MAX_QUERY_CHARS,
        "cache_ttl_seconds": CACHE_TTL_SECONDS,
        "rate_limit_per_min": MAX_CALLS_PER_MINUTE,
        "cached_entries": len(_AI_CACHE),
    }


@router.post("/analyze", response_model=AIAnalyzeResponse)
async def analyze_air_quality(req: AIAnalyzeRequest, request: Request):
    """
    Analyze air quality data using NVIDIA NIM (minimax-m3.1-flash), Google Gemini,
    or Pollinations Free AI with token-saving caching and rate limiting.
    """
    if req.extra_context and len(req.extra_context) > MAX_QUERY_CHARS:
        req.extra_context = req.extra_context[:MAX_QUERY_CHARS]

    key = _cache_key(req)
    now = time.time()
    cached = _AI_CACHE.get(key)
    if cached and (now - cached[0]) < CACHE_TTL_SECONDS:
        resp = cached[1]
        return AIAnalyzeResponse(
            city=resp.city,
            aqi=resp.aqi,
            summary=resp.summary,
            health_advice=resp.health_advice,
            recommendations=resp.recommendations,
            model_used=f"{resp.model_used} (cached-0-tokens)",
        )

    client_ip = request.client.host if getattr(request, "client", None) else "local"
    _enforce_rate_limit(client_ip)
    prompt = _build_prompt(req)

    if _NVIDIA_READY:
        try:
            status, n_json = await _post_json(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                payload={
                    "model": NVIDIA_MODEL,
                    "messages": [
                        {"role": "system", "content": "Respond ONLY with valid JSON. No markdown."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": TEMPERATURE,
                    "top_p": 0.95,
                    "max_tokens": 1200,
                    "seed": 0,
                },
                headers={"Authorization": f"Bearer {NVIDIA_API_KEY}"},
            )
            if status != 200:
                raise HTTPException(status_code=502, detail=f"NVIDIA AI error: HTTP {status}")
            msg_obj = (n_json.get("choices") or [{}])[0].get("message", {})
            raw_text = msg_obj.get("content") or msg_obj.get("reasoning_content") or ""
            parsed = _parse_ai_response(raw_text)
            result = AIAnalyzeResponse(
                city=req.city,
                aqi=req.aqi,
                summary=parsed.get("summary", ""),
                health_advice=parsed.get("health_advice", ""),
                recommendations=parsed.get("recommendations", []),
                model_used=NVIDIA_MODEL,
            )
            _AI_CACHE[key] = (now, result)
            return result
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"NVIDIA AI error: {exc}")

    if not _GEMINI_READY or genai is None:
        try:
            status, p_json = await _post_json(
                "https://text.pollinations.ai/openai",
                payload={
                    "model": "openai",
                    "messages": [
                        {"role": "system", "content": "Respond ONLY with valid JSON. No markdown."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": TEMPERATURE,
                    "max_tokens": 450,
                },
            )
            if status != 200:
                raise HTTPException(status_code=502, detail=f"Free AI API error: HTTP {status}")
            raw_text = (p_json.get("choices") or [{}])[0].get("message", {}).get("content", "")
            model_name = f"pollinations-{p_json.get('model', 'free-ai')}"
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Free AI API error: {exc}")

        parsed = _parse_ai_response(raw_text)
        result = AIAnalyzeResponse(
            city=req.city,
            aqi=req.aqi,
            summary=parsed.get("summary", ""),
            health_advice=parsed.get("health_advice", ""),
            recommendations=parsed.get("recommendations", []),
            model_used=model_name,
        )
        _AI_CACHE[key] = (now, result)
        return result

    try:
        model = genai.GenerativeModel(MODEL_NAME)
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=TEMPERATURE,
                max_output_tokens=MAX_OUTPUT_TOKENS,
            ),
        )
        raw_text = response.text
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}")

    parsed = _parse_ai_response(raw_text)
    result = AIAnalyzeResponse(
        city=req.city,
        aqi=req.aqi,
        summary=parsed.get("summary", ""),
        health_advice=parsed.get("health_advice", ""),
        recommendations=parsed.get("recommendations", []),
        model_used=MODEL_NAME,
    )
    _AI_CACHE[key] = (now, result)
    return result
