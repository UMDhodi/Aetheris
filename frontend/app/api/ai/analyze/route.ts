import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MAX_QUERY_CHARS = 220;
const TEMPERATURE = 0.15;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_COOLDOWN_MS = 3000;
const MAX_CALLS_PER_MIN = 10;

interface CachedEntry {
  ts: number;
  data: {
    city: string;
    aqi: number;
    summary: string;
    health_advice: string;
    recommendations: string[];
    model_used: string;
  };
}

const aiCache = new Map<string, CachedEntry>();
const clientCalls = new Map<string, number[]>();

function loadNvidiaConfig(): { apiKey: string; model: string } {
  let apiKey = process.env.NVIDIA_API_KEY || "";
  let model = process.env.NVIDIA_MODEL || "minimaxai/minimax-m3.1-flash";

  if (!apiKey) {
    const candidates = [
      path.resolve(process.cwd(), "..", "backend", ".env"),
      path.resolve(process.cwd(), "backend", ".env"),
    ];
    for (const envPath of candidates) {
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
          const idx = trimmed.indexOf("=");
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim();
          if (k === "NVIDIA_API_KEY" && v) apiKey = v;
          if (k === "NVIDIA_MODEL" && v) model = v;
        }
        if (apiKey) break;
      }
    }
  }
  return { apiKey, model };
}

function parseJsonResponse(text: string): {
  summary: string;
  health_advice: string;
  recommendations: string[];
} {
  let clean = (text || "").trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  }
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }
  try {
    const parsed = JSON.parse(clean);
    return {
      summary: String(parsed.summary || ""),
      health_advice: String(parsed.health_advice || ""),
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map(String)
        : [],
    };
  } catch {
    return {
      summary: clean || "AI analysis completed.",
      health_advice: "",
      recommendations: [],
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const city = String(body.city || "Unknown");
    const aqi = Number(body.aqi || 0);
    const extraContext = String(body.extra_context || "").trim().slice(0, MAX_QUERY_CHARS);

    const bucketAqi = Math.round(aqi / 5) * 5;
    const cacheKey = `${city.toLowerCase()}|${bucketAqi}|${extraContext.toLowerCase()}`;
    const now = Date.now();

    const cached = aiCache.get(cacheKey);
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json({
        ...cached.data,
        model_used: `${cached.data.model_used} (cached-0-tokens)`,
      });
    }

    const clientIp = req.headers.get("x-forwarded-for") || "local";
    const history = (clientCalls.get(clientIp) || []).filter((ts) => now - ts < 60000);
    if (history.length > 0 && now - history[history.length - 1] < MIN_COOLDOWN_MS) {
      return NextResponse.json(
        { detail: "Cooldown active: wait 3s between AI requests to conserve tokens." },
        { status: 429 }
      );
    }
    if (history.length >= MAX_CALLS_PER_MIN) {
      return NextResponse.json(
        { detail: `Rate limit reached (${MAX_CALLS_PER_MIN} AI requests/min).` },
        { status: 429 }
      );
    }
    history.push(now);
    clientCalls.set(clientIp, history);

    const { apiKey, model } = loadNvidiaConfig();
    if (!apiKey) {
      return NextResponse.json(
        { detail: "NVIDIA_API_KEY not found in backend/.env." },
        { status: 503 }
      );
    }

    const parts: string[] = [];
    if (body.pm25 != null) parts.push(`PM2.5=${body.pm25}`);
    if (body.pm10 != null) parts.push(`PM10=${body.pm10}`);
    if (body.o3 != null) parts.push(`O3=${body.o3}`);
    if (body.no2 != null) parts.push(`NO2=${body.no2}`);
    if (body.so2 != null) parts.push(`SO2=${body.so2}`);
    if (body.co != null) parts.push(`CO=${body.co}`);

    const prompt =
      `Role: Precise air-quality advisor. Cite ONLY provided numbers; never invent routes or stats.\n` +
      `Data: City=${city}; AQI=${aqi}; ${parts.join(", ") || "none"} ug/m3.\n` +
      `UserQ: ${extraContext || "General exposure guidance"}\n` +
      `Return strict JSON only: {"summary":"<=30 words","health_advice":"<=35 words","recommendations":["<=12 words","<=12 words","<=12 words"]}`;

    const nvRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Respond ONLY with valid JSON. No markdown." },
          { role: "user", content: prompt },
        ],
        temperature: TEMPERATURE,
        top_p: 0.95,
        max_tokens: 1200,
        seed: 0,
      }),
    });

    if (!nvRes.ok) {
      const errText = await nvRes.text().catch(() => "");
      return NextResponse.json(
        { detail: `NVIDIA AI HTTP ${nvRes.status}: ${errText.slice(0, 150)}` },
        { status: 502 }
      );
    }

    const nvJson = await nvRes.json();
    const msgObj = nvJson?.choices?.[0]?.message || {};
    const rawText = msgObj.content || msgObj.reasoning_content || "";
    const parsed = parseJsonResponse(rawText);

    const result = {
      city,
      aqi,
      summary: parsed.summary,
      health_advice: parsed.health_advice,
      recommendations: parsed.recommendations,
      model_used: model,
    };

    aiCache.set(cacheKey, { ts: now, data: result });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { detail: `AI route error: ${err?.message || err}` },
      { status: 500 }
    );
  }
}
