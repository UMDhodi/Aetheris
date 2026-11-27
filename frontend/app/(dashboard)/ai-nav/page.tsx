"use client";

import { useState, useEffect, useRef } from "react";
import { fetchLiveAirQuality, reverseGeocodeLocation, AirQualityMetrics } from "@/lib/api";

interface AiSynthesisOutput {
  summary: string;
  healthAdvice: string;
  recommendations: string[];
  sourceLabel: string;
}

const MAX_QUERY_CHARS = 220;
const SESSION_CALL_LIMIT = 12;
const COOLDOWN_MS = 3000;

export default function AiNavPage() {
  const [locationName, setLocationName] = useState("Haridwar, Uttarakhand, India");
  const [metrics, setMetrics] = useState<AirQualityMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const [query, setQuery] = useState("Best ventilation window and indoor HEPA plan right now");
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState("Gathering live Open-Meteo telemetry...");
  const [analysisResult, setAnalysisResult] = useState<AiSynthesisOutput | null>(null);
  const [guardrailNotice, setGuardrailNotice] = useState<string | null>(null);
  const [sessionCalls, setSessionCalls] = useState(0);

  const lastCallRef = useRef<number>(0);
  const cacheRef = useRef<Map<string, AiSynthesisOutput>>(new Map());

  const presets = [
    {
      label: "Best ventilation window",
      query: "Best ventilation window and indoor HEPA plan right now",
      icon: "sunny",
    },
    {
      label: "DIY Corsi-Rosenthal vs HVAC",
      query: "Compare DIY Corsi-Rosenthal box vs central MERV-13 blower at current PM2.5",
      icon: "airware",
    },
    {
      label: "Safe indoor exercise",
      query: "Safe indoor cardio timing given current trapping ceiling and PM2.5",
      icon: "fitness_center",
    },
    {
      label: "Inversion flush outlook",
      query: "When will wind shear clear the current thermal inversion?",
      icon: "thermostat",
    },
  ];

  // Load real live telemetry on mount
  useEffect(() => {
    let active = true;
    async function initTelemetry() {
      setLoadingMetrics(true);
      let lat = 29.9457;
      let lon = 78.1642;
      let city = "Haridwar, Uttarakhand, India";

      try {
        const ipRes = await fetch("https://ipapi.co/json/", { cache: "no-store" });
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          if (ipData.latitude && ipData.longitude) {
            lat = ipData.latitude;
            lon = ipData.longitude;
            city = `${ipData.city || "Haridwar"}, ${ipData.region || "Uttarakhand"}, ${ipData.country_name || "India"}`;
          }
        }
      } catch {
        if (typeof window !== "undefined" && "geolocation" in navigator) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
            );
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            city = await reverseGeocodeLocation(lat, lon);
          } catch {}
        }
      }

      if (!active) return;
      setLocationName(city);
      const data = await fetchLiveAirQuality(city, lat, lon);
      if (!active) return;
      setMetrics(data);
      setLoadingMetrics(false);
    }
    initTelemetry();
    return () => {
      active = false;
    };
  }, []);

  const buildGroundedFallback = (qText: string, m: AirQualityMetrics | null, note: string): AiSynthesisOutput => {
    const city = m?.city || locationName;
    const aqiVal = m?.aqiUs ?? 142;
    const pmVal = m?.pm25 ?? 52.4;
    const ceilVal = m?.trappingCeilingMsl ?? 420;
    const shearVal = m?.stagnationShear ?? 0.8;
    const flushVal = m?.predictedFlushHours ?? 38.5;
    const ridgeVal = m?.benchRidgePm25 ?? 10.1;

    return {
      summary: `Live telemetry for ${city}: AQI ${aqiVal} (PM2.5: ${pmVal} µg/m³) under a ${ceilVal}m MSL trapping ceiling with ${shearVal} m/s wind shear. Ridge air above the lid is ${ridgeVal} µg/m³.`,
      healthAdvice:
        aqiVal > 150
          ? `Unhealthy basin entrapment for "${qText.slice(0, 80)}". Keep windows sealed, avoid outdoor exertion, and run indoor HEPA recirculation.`
          : aqiVal > 100
          ? `Moderate-to-sensitive entrapment. Limit prolonged outdoor exertion and keep indoor filtration active until the +${flushVal}h flush.`
          : `Air quality is currently favorable (${aqiVal} AQI). Natural cross-ventilation is safe while wind shear remains ${shearVal} m/s.`,
      recommendations: [
        `Monitor ${ceilVal}m MSL lid: aerate indoors only during midday solar expansion (13:30–15:30).`,
        `Primary flush expected in +${flushVal}h; keep HEPA scrubber active until PM2.5 drops below 25 µg/m³.`,
        `Avoid high-exertion outdoor cardio while basin PM2.5 is ${pmVal} µg/m³.`,
      ],
      sourceLabel: note,
    };
  };

  const handleSynthesize = async (overrideQuery?: string) => {
    const rawQ = (overrideQuery ?? query).trim().slice(0, MAX_QUERY_CHARS);
    if (!rawQ) return;
    setGuardrailNotice(null);

    const aqiBucket = Math.round((metrics?.aqiUs ?? 142) / 5) * 5;
    const cacheKey = `${locationName.toLowerCase()}|${aqiBucket}|${rawQ.toLowerCase()}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setAnalyzing(false);
      setAnalysisResult({ ...cached, sourceLabel: "Session Cache (0 tokens used)" });
      return;
    }

    const now = Date.now();
    if (now - lastCallRef.current < COOLDOWN_MS) {
      setGuardrailNotice("Cooldown active (3s) to prevent duplicate token consumption.");
      return;
    }
    if (sessionCalls >= SESSION_CALL_LIMIT) {
      setGuardrailNotice(`Session AI cap reached (${SESSION_CALL_LIMIT} calls) to protect token quota.`);
      return;
    }

    lastCallRef.current = now;
    setAnalysisResult(null);
    setAnalyzing(true);
    setLoadingStep(`Locking live telemetry for ${locationName} (AQI ${metrics?.aqiUs ?? "--"})...`);

    const stepTimer = setTimeout(() => {
      setLoadingStep("Running NVIDIA minimaxai/minimax-m3.1-flash synthesis (token-capped)...");
    }, 650);

    let errReason = "";
    const payload = {
      city: locationName,
      aqi: metrics?.aqiUs ?? 142,
      pm25: metrics?.pm25 ?? 52.4,
      pm10: metrics?.pm10 ?? 78.0,
      o3: metrics?.ozone ?? 38.0,
      no2: metrics?.no2 ?? 28.1,
      so2: metrics?.so2 ?? 4.8,
      co: metrics?.carbonMonoxide ?? 420,
      extra_context: `${rawQ} [Lid:${metrics?.trappingCeilingMsl ?? 420}m,Shear:${metrics?.stagnationShear ?? 0.8}m/s,Flush:+${metrics?.predictedFlushHours ?? 38.5}h]`.slice(
        0,
        MAX_QUERY_CHARS
      ),
    };

    // 1. Try built-in Next.js server-side AI route (uses NVIDIA_API_KEY from backend/.env)
    //    and fall back to FastAPI (localhost:8000) if needed.
    const endpoints = [
      "/api/ai/analyze",
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/ai/analyze`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          const out: AiSynthesisOutput = {
            summary: data.summary,
            healthAdvice: data.health_advice,
            recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
            sourceLabel: `AI Model: ${data.model_used || "minimaxai/minimax-m3.1-flash"} (token-capped)`,
          };
          cacheRef.current.set(cacheKey, out);
          setSessionCalls((c) => c + 1);
          clearTimeout(stepTimer);
          setAnalyzing(false);
          setAnalysisResult(out);
          return;
        }
        const errJson = await res.json().catch(() => ({}));
        errReason = errJson.detail || `HTTP ${res.status}`;
      } catch (e: any) {
        errReason = e?.message || "Endpoint unreachable";
      }
    }

    clearTimeout(stepTimer);
    setAnalyzing(false);
    setGuardrailNotice(`AI request failed (${errReason}). Please try again.`);
  };

  const aqi = metrics?.aqiUs ?? 142;
  const pm25 = metrics?.pm25 ?? 52.4;
  const ridgeAqi = metrics?.benchRidgeAqi ?? 21;
  const ridgePm = metrics?.benchRidgePm25 ?? 10.1;
  const lidMsl = metrics?.trappingCeilingMsl ?? 420;
  const shear = metrics?.stagnationShear ?? 0.8;
  const flushHrs = metrics?.predictedFlushHours ?? 38.5;
  const reductionPct = Math.max(1, Math.round((1 - ridgePm / Math.max(1, pm25)) * 100));
  const flushTimeStr = new Date(Date.now() + flushHrs * 3600000).toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const aqiColor = aqi <= 50 ? "text-primary" : aqi <= 100 ? "text-[#b45309]" : "text-secondary";
  const aqiBorder = aqi <= 50 ? "bg-primary" : aqi <= 100 ? "bg-[#f59e0b]" : "bg-secondary";

  return (
    <div className="flex flex-col w-full">
      {/* Live Telemetry Bar */}
      <div className="w-full bg-secondary-container/10 px-margin md:px-margin-tablet lg:px-margin-desktop py-space-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm text-secondary">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary"></span>
          </span>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">
            {aqi > 100 ? "THERMAL INVERSION ENTRAPMENT ACTIVE" : "FAVORABLE BASIN DISPERSION"}
          </span>
          <span className="hidden sm:inline text-on-surface-variant font-body-sm text-body-sm">
            — {locationName} • Boundary Lid: {lidMsl}m MSL • Wind Shear: {shear} m/s
          </span>
        </div>
        <div className="flex items-center gap-space-md text-on-surface-variant">
          <span className="font-label-md text-label-md flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px] text-primary">token</span>
            AI Budget: {sessionCalls}/{SESSION_CALL_LIMIT} calls • Max 260 tokens
          </span>
        </div>
      </div>

      {/* Hero Editorial & Copilot Prompt Interface */}
      <div className="w-full max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop pt-space-xl pb-space-lg">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg pb-space-xl">
          <div className="max-w-3xl space-y-space-sm">
            <div className="inline-flex items-center gap-2 px-space-sm py-space-xs rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm tracking-wide uppercase">
              <span className="material-symbols-outlined text-[16px] text-primary">neurology</span>
              Token-Restricted AI Copilot • Grounded Open-Meteo Telemetry
            </div>
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">
              Breathe Cleaner, Live Smarter in Severe Smog.
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
              Synthesizes live planetary boundary layer soundings and real-time pollutant concentrations for{" "}
              <strong className="text-on-surface">{locationName}</strong> with strict token-saving caching.
            </p>
          </div>
          <div className="flex items-center gap-space-md self-start lg:self-auto">
            <div className="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-center gap-space-md">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[24px]">verified_user</span>
              </div>
              <div>
                <div className="font-label-sm text-label-sm uppercase text-outline">Ridge Clean-Air Delta</div>
                <div className="font-headline-sm text-headline-sm text-primary flex items-center gap-1">
                  -{reductionPct}% PM2.5 <span className="material-symbols-outlined text-[18px]">trending_down</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Command-Search Bar & Preset Query Matrix */}
        <div className="w-full bg-surface-container-lowest p-space-md md:p-space-lg rounded-xl shadow-md space-y-space-md">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-space-sm bg-surface-container-low rounded-lg p-space-xs">
            <div className="flex items-center gap-space-sm px-space-sm text-primary">
              <span className="material-symbols-outlined text-[20px]">terminal</span>
              <span className="font-label-md text-label-md font-mono text-outline">aetheris://copilot&gt;</span>
            </div>
            <input
              className="flex-1 bg-transparent border-0 px-space-xs py-space-sm font-body-md text-body-md text-on-surface focus:outline-none placeholder-outline"
              type="text"
              maxLength={MAX_QUERY_CHARS}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSynthesize();
              }}
              placeholder="Ask Copilot (max 220 chars) for ventilation windows or filtration advice..."
            />
            <div className="flex items-center gap-space-xs">
              <span className="text-[11px] text-outline px-1">
                {query.length}/{MAX_QUERY_CHARS}
              </span>
              <button
                className="p-space-xs text-outline hover:text-on-surface rounded transition-colors"
                onClick={() => setQuery("")}
                title="Clear"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">backspace</span>
              </button>
              <button
                onClick={() => handleSynthesize()}
                disabled={analyzing}
                className="px-space-lg py-space-sm bg-primary text-on-primary hover:bg-primary-container rounded-lg font-label-md text-label-md flex items-center gap-space-xs shadow-sm transition-all active:scale-[0.98]"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                <span>{analyzing ? "Synthesizing..." : "Synthesize Plan"}</span>
              </button>
            </div>
          </div>

          {/* Presets Chips */}
          <div className="flex flex-wrap items-center gap-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline mr-space-xs">
              Suggested Inquiries:
            </span>
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  setQuery(preset.query);
                  handleSynthesize(preset.query);
                }}
                className="px-space-sm py-space-xs rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high transition-colors flex items-center gap-1"
                type="button"
              >
                <span className="material-symbols-outlined text-[14px] text-primary">{preset.icon}</span>
                {preset.label}
              </button>
            ))}
          </div>

          {guardrailNotice && (
            <div className="px-3 py-2 rounded-lg bg-[#fefce8] border border-[#f59e0b]/40 text-xs font-semibold text-[#b45309]">
              {guardrailNotice}
            </div>
          )}

          {analyzing && (
            <div className="p-5 bg-surface-container-low rounded-xl border border-primary/30 space-y-3">
              <div className="flex items-center gap-4">
                <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary animate-spin"></div>
                  <span className="material-symbols-outlined text-primary text-[20px] animate-pulse">neurology</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      AI Model Synthesizing
                    </span>
                    <span className="text-[11px] font-mono text-outline">NVIDIA minimaxai/minimax-m3.1-flash</span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5 font-medium">{loadingStep}</p>
                </div>
              </div>
              <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                <div className="h-full w-2/3 bg-gradient-to-r from-primary via-[#34d399] to-primary rounded-full animate-pulse"></div>
              </div>
            </div>
          )}

          {!analyzing && analysisResult && (
            <div className="p-space-md bg-surface-container-low rounded-xl border border-primary/20 flex items-start gap-space-sm text-on-surface animate-fadeIn">
              <span className="material-symbols-outlined text-primary text-[24px] mt-0.5">psychology</span>
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-label-md font-bold text-primary">Copilot Synthesis Output</p>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-surface-container text-outline">
                    {analysisResult.sourceLabel}
                  </span>
                </div>
                <p className="font-body-md text-on-surface leading-relaxed">{analysisResult.summary}</p>
                <p className="font-body-sm text-on-surface-variant">{analysisResult.healthAdvice}</p>
                {analysisResult.recommendations.length > 0 && (
                  <ul className="list-disc pl-4 text-xs text-on-surface-variant space-y-0.5 pt-1">
                    {analysisResult.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Telemetry Sensor Matrix (4 Real-Time Cards) */}
      <div className="w-full max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter-desktop">
          {/* Card 1: Live Outdoor Basin AQI */}
          <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className={`absolute top-0 left-0 right-0 h-1 ${aqiBorder}`}></div>
            <div className="space-y-space-xs">
              <div className="flex items-center justify-between">
                <span className={`font-label-sm uppercase tracking-wider font-bold ${aqiColor}`}>
                  Outdoor Basin AQI
                </span>
                <span className={`material-symbols-outlined text-[20px] ${aqiColor}`}>crisis_alert</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`font-headline-xl text-headline-xl font-extrabold ${aqiColor}`}>
                  {loadingMetrics ? "..." : aqi}
                </span>
                <span className="font-label-md text-outline">PM2.5: {loadingMetrics ? "..." : pm25} µg/m³</span>
              </div>
              <p className="font-body-sm text-on-surface-variant">
                {metrics?.aqiCategory || "Live telemetry"} at {locationName.split(",")[0]}.
              </p>
            </div>
          </div>

          {/* Card 2: Live Bench Ridge Clean Air */}
          <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>
            <div className="space-y-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-label-sm uppercase tracking-wider text-primary font-bold">
                  Bench Ridge AQI
                </span>
                <span className="material-symbols-outlined text-primary text-[20px]">filter_drama</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-headline-xl text-headline-xl text-primary font-extrabold">
                  {loadingMetrics ? "..." : ridgeAqi}
                </span>
                <span className="font-label-md text-outline">PM2.5: {loadingMetrics ? "..." : ridgePm} µg/m³</span>
              </div>
              <p className="font-body-sm text-on-surface-variant">
                Elevation benchmark above the {lidMsl}m MSL trapping ceiling.
              </p>
            </div>
          </div>

          {/* Card 3: Live Trapping Ceiling & Wind Shear */}
          <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-tertiary"></div>
            <div className="space-y-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-label-sm uppercase tracking-wider text-tertiary font-bold">
                  Trapping Lid &amp; Shear
                </span>
                <span className="material-symbols-outlined text-tertiary text-[20px]">compress</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-headline-xl text-headline-xl text-on-surface font-extrabold">
                  {loadingMetrics ? "..." : `${lidMsl}m`}
                </span>
                <span className="font-label-md text-outline">Shear: {loadingMetrics ? "..." : shear} m/s</span>
              </div>
              <p className="font-body-sm text-on-surface-variant">
                {shear < 1.5
                  ? "Stagnant lateral wind (< 1.5 m/s) holding surface particulates."
                  : "Active horizontal mixing assisting surface dispersion."}
              </p>
            </div>
          </div>

          {/* Card 4: Live Forecast Flush Window */}
          <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary-container"></div>
            <div className="space-y-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-label-sm uppercase tracking-wider text-primary font-bold">
                  Inversion Flush
                </span>
                <span className="material-symbols-outlined text-primary text-[20px]">air</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-headline-xl text-headline-xl text-on-surface font-extrabold">
                  {loadingMetrics ? "..." : `+${flushHrs}h`}
                </span>
                <span className="font-label-md text-outline">{flushTimeStr}</span>
              </div>
              <p className="font-body-sm text-on-surface-variant">
                Projected atmospheric mixing / boundary expansion above 750m MSL.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
