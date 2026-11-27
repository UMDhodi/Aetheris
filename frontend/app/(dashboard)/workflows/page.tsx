"use client";

import { useState, useEffect } from "react";
import { fetchLiveAirQuality, resolveAccurateLocation, AirQualityMetrics } from "@/lib/api";

export default function WorkflowsPage() {
  const [filter, setFilter] = useState("all");
  const [locationName, setLocationName] = useState("Haridwar, Uttarakhand, India");
  const [metrics, setMetrics] = useState<AirQualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadTelemetry() {
      setLoading(true);
      const loc = await resolveAccurateLocation(false);
      if (!active) return;
      setLocationName(loc.name);
      const data = await fetchLiveAirQuality(loc.name, loc.lat, loc.lon);
      if (!active) return;
      setMetrics(data);
      setLoading(false);
    }
    loadTelemetry();
    return () => {
      active = false;
    };
  }, []);

  const aqi = metrics?.aqiUs ?? 142;
  const pm25 = metrics?.pm25 ?? 52.4;
  const no2 = metrics?.no2 ?? 28.1;
  const ridgePm = metrics?.benchRidgePm25 ?? 10.1;
  const lidMsl = metrics?.trappingCeilingMsl ?? 420;
  const shear = metrics?.stagnationShear ?? 0.8;
  const flushHrs = metrics?.predictedFlushHours ?? 38.5;
  const suppressionPct = parseFloat(Math.max(1, (1 - ridgePm / Math.max(1, pm25)) * 100).toFixed(1));
  const indoorScrubbedPm = Math.max(3.5, parseFloat((pm25 * 0.14).toFixed(1)));
  const kitchenReductionPct = Math.round((1 - indoorScrubbedPm / Math.max(10, pm25 + 60)) * 100);
  const shortCity = locationName.split(",")[0].trim();

  const workflows = [
    {
      id: "commute",
      protocol: "Scenario Protocol 01",
      title: "School Morning Commute & Activity Flow",
      benefit: `${Math.round(suppressionPct)}% Soot Intake Prevented`,
      icon: "directions_car",
      traditional: {
        title: "Traditional Default Routine",
        location: `${shortCity} Basin Floor`,
        items: [
          `Leave windows unsealed during morning inversion (${lidMsl}m MSL trapping lid)`,
          `Transit through low-lying ${shortCity} roads with ${shear} m/s stagnation shear`,
          `Recirculation OFF draws ${pm25} µg/m³ external PM2.5 (AQI ${aqi}) inside`,
          aqi > 100
            ? "Unfiltered outdoor activity during elevated particulate trapping"
            : "Standard outdoor exposure without peak-hour timing",
        ],
      },
      aetheris: {
        title: "Aetheris Live Protocol",
        location: `Above ${lidMsl}m MSL / HEPA`,
        items: [
          aqi > 100
            ? `Seal threshold gaskets; run indoor HEPA pre-scrub until midday vent`
            : `Natural cross-ventilation safe while AQI stays at ${aqi}`,
          `Elevated / ridge benchmark reduces PM2.5 from ${pm25} to ${ridgePm} µg/m³`,
          "Engage cabin HEPA recirculation mode prior to arterial transit",
          `Next atmospheric mixing flush projected in +${flushHrs}h`,
        ],
      },
    },
    {
      id: "cooking",
      protocol: "Scenario Protocol 02",
      title: "Indoor Air & Kitchen Environmental Hygiene",
      benefit: `${kitchenReductionPct}% Particulate Scrubbing`,
      icon: "soup_kitchen",
      traditional: {
        title: "Unventilated Cooking Routine",
        location: `Outdoor NO₂: ${no2} µg/m³`,
        items: [
          "Gas range burner running without exterior range hood exhaust",
          `Indoor cooking spikes compound ${pm25} µg/m³ ambient ${shortCity} PM2.5`,
          `Ambient NO₂ (${no2} µg/m³) accumulates indoors without catalytic/carbon scrubbers`,
          "No airflow separation between kitchen and sleeping quarters",
        ],
      },
      aetheris: {
        title: "Aetheris Live Protocol",
        location: `Target: ${indoorScrubbedPm} µg/m³`,
        items: [
          "Run exterior exhaust hood 5 min before and 15 min after cooking",
          `Boost HEPA / Corsi-Rosenthal unit to hold indoor PM2.5 near ${indoorScrubbedPm} µg/m³`,
          aqi > 100
            ? `Keep outdoor windows closed during ${lidMsl}m lid compression; vent only at 13:30–15:30`
            : `Safe to pair range exhaust with cracked-window cross-flow (AQI ${aqi})`,
          "Isolate bedroom doors during high-heat sautéing",
        ],
      },
    },
    {
      id: "fitness",
      protocol: "Scenario Protocol 03",
      title: "Work & Fitness Respiratory Ergonomics",
      benefit: `${Math.round(suppressionPct)}% Lung Deposition Reduction`,
      icon: "fitness_center",
      traditional: {
        title: "Unfiltered Street-Level Cardio",
        location: `${shortCity} (${pm25} µg/m³)`,
        items: [
          `Outdoor jogging at street level while PM2.5 is ${pm25} µg/m³ (AQI ${aqi})`,
          `Low wind shear (${shear} m/s) keeps exhaust suspended at breathing height`,
          "Deep minute ventilation multiplies inhaled fine particulate dose",
        ],
      },
      aetheris: {
        title: "Aetheris Live Protocol",
        location: aqi > 100 ? `HEPA Indoor (${indoorScrubbedPm} µg/m³)` : `Outdoor Safe Window`,
        items: [
          aqi > 100
            ? `Shift cardio indoors with HEPA scrubbing (~${indoorScrubbedPm} µg/m³) or above ${lidMsl}m MSL (${ridgePm} µg/m³)`
            : `Outdoor cardio favorable in ${shortCity} (AQI ${aqi}, PM2.5 ${pm25} µg/m³)`,
          `Monitor solar expansion window (13:30–15:30) or +${flushHrs}h frontal flush`,
          `Avoid heavy exertion near traffic corridors while NO₂ is ${no2} µg/m³`,
        ],
      },
    },
  ];

  const filtered = filter === "all" ? workflows : workflows.filter((w) => w.id === filter);

  return (
    <div className="flex flex-col w-full">
      <div className="w-full max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-lg">
        {/* Header Section */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md pb-space-lg">
          <div className="max-w-3xl space-y-space-xs">
            <span className="font-label-sm uppercase tracking-widest text-primary font-bold">
              LIVE BEHAVIORAL INTERVENTION PLAYBOOK • {locationName}
            </span>
            <h1 className="font-headline-xl text-headline-xl text-on-surface font-extrabold tracking-tight">
              Action Workflows &amp; Mitigation Protocols
            </h1>
            <p className="font-body-lg text-on-surface-variant">
              Live routines calibrated to <strong className="text-on-surface">{shortCity}</strong> telemetry: AQI{" "}
              <strong className="text-on-surface">{loading ? "..." : aqi}</strong>, PM2.5{" "}
              <strong className="text-on-surface">{loading ? "..." : pm25} µg/m³</strong>, Trapping Lid{" "}
              <strong className="text-on-surface">{loading ? "..." : lidMsl}m MSL</strong>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-space-xs bg-surface-container-low p-space-md rounded-xl">
            <span className="font-label-sm text-outline uppercase tracking-wider">Live Suppression Factor</span>
            <div className="flex items-baseline gap-space-xs">
              <span className="font-headline-xl text-primary font-bold tracking-tight">
                {loading ? "..." : `-${suppressionPct}%`}
              </span>
              <span className="material-symbols-outlined text-primary text-[28px]">shield</span>
            </div>
            <span className="font-label-md text-on-surface-variant">
              Ridge vs Basin PM2.5 ({ridgePm} vs {pm25} µg/m³)
            </span>
            <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden mt-space-xs">
              <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${suppressionPct}%` }}></div>
            </div>
          </div>
        </section>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-space-xs pb-space-lg">
          <span className="font-label-sm text-outline uppercase tracking-wider mr-space-xs">
            Workflow Class:
          </span>
          <button
            onClick={() => setFilter("all")}
            className={`px-space-md py-space-xs rounded-full font-label-md text-label-md transition-all ${
              filter === "all"
                ? "bg-primary text-on-primary shadow-sm"
                : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
            }`}
            type="button"
          >
            All Scenarios ({workflows.length})
          </button>
          <button
            onClick={() => setFilter("commute")}
            className={`px-space-md py-space-xs rounded-full font-label-md text-label-md transition-all ${
              filter === "commute"
                ? "bg-primary text-on-primary shadow-sm"
                : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
            }`}
            type="button"
          >
            Commute &amp; School
          </button>
          <button
            onClick={() => setFilter("cooking")}
            className={`px-space-md py-space-xs rounded-full font-label-md text-label-md transition-all ${
              filter === "cooking"
                ? "bg-primary text-on-primary shadow-sm"
                : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
            }`}
            type="button"
          >
            Cooking &amp; Heating
          </button>
          <button
            onClick={() => setFilter("fitness")}
            className={`px-space-md py-space-xs rounded-full font-label-md text-label-md transition-all ${
              filter === "fitness"
                ? "bg-primary text-on-primary shadow-sm"
                : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
            }`}
            type="button"
          >
            Work &amp; Fitness
          </button>
        </div>

        {/* Comparative Cards */}
        <section className="space-y-space-lg">
          {filtered.map((wf) => (
            <article
              key={wf.id}
              className="bg-surface-container-lowest rounded-xl p-space-md md:p-space-lg shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md gap-space-sm border-b border-surface-container">
                <div className="flex items-center gap-space-sm">
                  <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface">
                    <span className="material-symbols-outlined text-[24px]">{wf.icon}</span>
                  </div>
                  <div>
                    <span className="font-label-sm text-outline uppercase tracking-wider">{wf.protocol}</span>
                    <h2 className="font-headline-sm font-bold text-on-surface">{wf.title}</h2>
                  </div>
                </div>
                <div className="inline-flex items-center gap-space-xs px-space-sm py-space-xs rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm font-semibold">
                  <span className="material-symbols-outlined text-[16px]">verified_user</span>
                  {wf.benefit}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md mt-space-md">
                {/* Traditional */}
                <div className="rounded-xl p-space-md bg-secondary-fixed/30 space-y-space-md border border-secondary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-secondary text-[20px]">warning</span>
                      <span className="font-label-md text-secondary font-bold uppercase tracking-wider">
                        {wf.traditional.title}
                      </span>
                    </div>
                    <span className="font-label-sm text-on-surface-variant font-medium">
                      {wf.traditional.location}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {wf.traditional.items.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 font-body-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-secondary text-[16px] shrink-0 mt-0.5">
                          close
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Aetheris Protocol */}
                <div className="rounded-xl p-space-md bg-primary-fixed/20 space-y-space-md border border-primary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
                      <span className="font-label-md text-primary font-bold uppercase tracking-wider">
                        {wf.aetheris.title}
                      </span>
                    </div>
                    <span className="font-label-sm text-primary font-bold">
                      {wf.aetheris.location}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {wf.aetheris.items.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 font-body-sm text-on-surface">
                        <span className="material-symbols-outlined text-primary text-[16px] shrink-0 mt-0.5">
                          done
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
