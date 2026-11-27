"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchLiveAirQuality,
  fetchCommunityStations,
  resolveAccurateLocation,
  AirQualityMetrics,
  CommunityStationData,
} from "@/lib/api";

export default function ImpactMetricsPage() {
  const [locationName, setLocationName] = useState("Haridwar, Uttarakhand, India");
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({ lat: 29.9457, lon: 78.1642 });
  const [metrics, setMetrics] = useState<AirQualityMetrics | null>(null);
  const [gridNodes, setGridNodes] = useState<CommunityStationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string>("--");

  const loadLiveAudit = useCallback(async (city: string, lat: number, lon: number) => {
    setLoading(true);
    const data = await fetchLiveAirQuality(city, lat, lon);
    const nodes = await fetchCommunityStations(lat, lon, data.pm25, data.aqiUs);
    setMetrics(data);
    setGridNodes(nodes);
    setLastSynced(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      const loc = await resolveAccurateLocation(false);
      if (!active) return;
      setLocationName(loc.name);
      setCoords({ lat: loc.lat, lon: loc.lon });
      await loadLiveAudit(loc.name, loc.lat, loc.lon);
    }
    init();
    return () => {
      active = false;
    };
  }, [loadLiveAudit]);

  const aqi = metrics?.aqiUs ?? 142;
  const pm25 = metrics?.pm25 ?? 52.4;
  const no2 = metrics?.no2 ?? 28.1;
  const o3 = metrics?.ozone ?? 38.0;
  const ridgePm = metrics?.benchRidgePm25 ?? 10.1;
  const lidMsl = metrics?.trappingCeilingMsl ?? 420;
  const flushHrs = metrics?.predictedFlushHours ?? 38.5;

  // Real daily pulmonary particulate calculation (~14.4 m³/day adult breathing volume)
  const dailyAirM3 = 14.4;
  const unmitigatedDailyMg = (pm25 * dailyAirM3) / 1000;
  const mitigatedDailyMg = (ridgePm * dailyAirM3) / 1000;
  const dailyInterceptedMg = Math.max(0, unmitigatedDailyMg - mitigatedDailyMg);
  const monthlyInterceptedMg = dailyInterceptedMg * 30;
  const reductionPct = parseFloat(Math.max(1, (1 - ridgePm / Math.max(1, pm25)) * 100).toFixed(1));

  // Real regional grid stats
  const avgGridAqi =
    gridNodes.length > 0
      ? Math.round(gridNodes.reduce((acc, n) => acc + n.aqi, 0) / gridNodes.length)
      : aqi;
  const optimalNodes = gridNodes.filter((n) => n.status === "Optimal").length;

  const riskLabel =
    aqi <= 50
      ? "Low Risk (Level 1)"
      : aqi <= 100
      ? "Moderate Risk (Level 2)"
      : aqi <= 150
      ? "Sensitive Group Alert (Level 3)"
      : "High Respiratory Risk (Level 4)";
  const riskBarPct = Math.min(100, Math.max(12, Math.round((aqi / 300) * 100)));

  const handleExportAudit = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      location: locationName,
      coordinates: coords,
      liveTelemetry: metrics,
      computedDailyInterceptedMg: parseFloat(dailyInterceptedMg.toFixed(3)),
      computedMonthlyInterceptedMg: parseFloat(monthlyInterceptedMg.toFixed(2)),
      reductionPct,
      regionalGridNodes: gridNodes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aetheris-impact-audit-${locationName.split(",")[0].trim().toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col w-full">
      {/* Live Sync bar */}
      <div className="w-full bg-surface-container-low px-margin md:px-margin-tablet lg:px-margin-desktop py-space-xs border-b border-surface-container-high">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 font-label-sm text-outline">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            LIVE OPEN-METEO EXPOSURE AUDIT • {locationName.toUpperCase()} ({coords.lat.toFixed(3)}°, {coords.lon.toFixed(3)}°)
          </span>
          <span className="font-mono">SYNCED: {loading ? "FETCHING..." : lastSynced}</span>
        </div>
      </div>

      {/* Header */}
      <section className="w-full max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop pt-space-xl pb-space-lg">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg">
          <div className="max-w-3xl space-y-space-xs">
            <div className="inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sm uppercase tracking-widest">
              <span className="material-symbols-outlined text-[14px] text-primary">analytics</span>
              Live Atmospheric Exposure Audit
            </div>
            <h1 className="font-headline-xl text-headline-xl text-on-surface font-extrabold tracking-tight">
              Quantifiable Health Impact &amp; Exposure Ledger
            </h1>
            <p className="font-body-lg text-on-surface-variant leading-relaxed">
              Computed in real time from live <strong>{locationName}</strong> pollutant readings (AQI {loading ? "..." : aqi}, PM2.5{" "}
              {loading ? "..." : pm25} µg/m³) and {lidMsl}m MSL trapping boundary soundings.
            </p>
          </div>

          <div className="flex items-center gap-space-sm self-start lg:self-end">
            <button
              onClick={handleExportAudit}
              disabled={loading}
              className="inline-flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-lowest text-on-surface font-label-md shadow-sm hover:bg-surface-container transition-colors"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export Live Audit
            </button>
            <button
              onClick={() => loadLiveAudit(locationName, coords.lat, coords.lon)}
              disabled={loading}
              className="inline-flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-primary text-on-primary font-label-md shadow-sm hover:bg-primary-container transition-colors font-semibold"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              {loading ? "Syncing..." : "Refresh Live Telemetry"}
            </button>
          </div>
        </div>
      </section>

      {/* 3 Live Telemetry Ledger Cards */}
      <section className="w-full max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-desktop">
          {/* Card 1: Real Daily PM2.5 Mass Intercepted */}
          <div className="relative bg-surface-container-lowest p-space-lg rounded-xl shadow-sm overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>
            <div>
              <div className="flex items-center justify-between">
                <span className="font-label-sm uppercase tracking-wider text-primary font-bold">
                  Daily Toxin Interception
                </span>
                <span className="px-space-xs py-0.5 rounded-full bg-surface-container-low text-primary font-label-sm flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span> -{reductionPct}% vs Outdoor
                </span>
              </div>
              <div className="mt-space-md flex items-baseline gap-space-xs">
                <span className="font-headline-xl text-headline-xl text-on-surface font-extrabold">
                  {loading ? "..." : dailyInterceptedMg.toFixed(2)}
                </span>
                <span className="font-label-lg text-on-surface-variant font-bold">mg PM2.5 / day</span>
              </div>
              <p className="mt-space-xs font-body-sm text-on-surface-variant">
                Avoided pulmonary PM2.5 load (14.4 m³/day breathing rate) comparing outdoor {pm25} µg/m³ vs. {ridgePm} µg/m³ clean ridge/HEPA air.
              </p>
            </div>
            <div className="mt-space-lg pt-space-md bg-surface-container-low rounded-lg p-space-sm">
              <div className="flex items-center justify-between font-label-sm mb-1">
                <span className="text-on-surface-variant">30-Day Projected Mitigation</span>
                <span className="text-primary font-semibold">{monthlyInterceptedMg.toFixed(1)} mg PM2.5</span>
              </div>
              <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${Math.min(100, reductionPct)}%` }}></div>
              </div>
            </div>
          </div>

          {/* Card 2: Live Respiratory Risk & Gas Load */}
          <div className="relative bg-surface-container-lowest p-space-lg rounded-xl shadow-sm overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-tertiary"></div>
            <div>
              <div className="flex items-center justify-between">
                <span className="font-label-sm uppercase tracking-wider text-tertiary font-bold">
                  Live Respiratory Risk Index
                </span>
                <span className="px-space-xs py-0.5 rounded-full bg-surface-container-low text-tertiary font-label-sm flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Flush +{flushHrs}h
                </span>
              </div>
              <div className="mt-space-md flex items-baseline gap-space-xs">
                <span className="font-headline-xl text-headline-xl text-on-surface font-extrabold">
                  {loading ? "..." : aqi}
                </span>
                <span className="font-label-lg text-on-surface-variant font-bold">US EPA AQI</span>
              </div>
              <p className="mt-space-xs font-body-sm text-on-surface-variant">
                Live gas &amp; aerosol load: NO₂ {no2} µg/m³, Ozone (O₃) {o3} µg/m³ under a {lidMsl}m MSL trapping boundary.
              </p>
            </div>
            <div className="mt-space-lg pt-space-md bg-surface-container-low rounded-lg p-space-sm">
              <div className="flex items-center justify-between font-label-sm mb-1">
                <span className="text-on-surface-variant">Clinical Risk Quotient</span>
                <span className="text-tertiary font-semibold">{riskLabel}</span>
              </div>
              <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                <div className="bg-tertiary h-full rounded-full transition-all" style={{ width: `${riskBarPct}%` }}></div>
              </div>
            </div>
          </div>

          {/* Card 3: Live 3-Point Regional Open-Meteo Grid Coverage */}
          <div className="relative bg-surface-container-lowest p-space-lg rounded-xl shadow-sm overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-secondary"></div>
            <div>
              <div className="flex items-center justify-between">
                <span className="font-label-sm uppercase tracking-wider text-secondary font-bold">
                  Regional Grid Coverage
                </span>
                <span className="px-space-xs py-0.5 rounded-full bg-surface-container-low text-secondary font-label-sm flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span> Open-Meteo Live
                </span>
              </div>
              <div className="mt-space-md flex items-baseline gap-space-xs">
                <span className="font-headline-xl text-headline-xl text-on-surface font-extrabold">
                  {loading ? "..." : gridNodes.length}
                </span>
                <span className="font-label-lg text-on-surface-variant font-bold">Live Grid Nodes</span>
              </div>
              <p className="mt-space-xs font-body-sm text-on-surface-variant">
                Active multi-point Open-Meteo atmospheric grid around {locationName.split(",")[0]} ({optimalNodes}/{gridNodes.length} sectors Optimal).
              </p>
            </div>
            <div className="mt-space-lg pt-space-md bg-surface-container-low rounded-lg p-space-sm">
              <div className="flex items-center justify-between font-label-sm mb-1">
                <span className="text-on-surface-variant">Mean Regional Grid AQI</span>
                <span className="text-secondary font-semibold">{avgGridAqi} AQI</span>
              </div>
              <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                <div
                  className="bg-secondary h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(15, Math.round((avgGridAqi / 300) * 100)))}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
