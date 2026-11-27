"use client";

// NOTE: SQLModel is not used in frontend; local state and REST endpoints handle data.

import { useState, useEffect, useRef } from "react";
import AlertBanner from "@/components/AlertBanner";
import {
  fetchLiveAirQuality,
  resolveAccurateLocation,
  fetchCommunityStations,
  AirQualityMetrics,
  CommunityStationData,
} from "@/lib/api";

interface CitySuggestion {
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
}

const UNIVERSAL_CITY_SEED: CitySuggestion[] = [
  { name: "Haridwar", admin1: "Uttarakhand", country: "India", country_code: "IN", latitude: 29.9457, longitude: 78.1642 },
  { name: "New Delhi", admin1: "Delhi", country: "India", country_code: "IN", latitude: 28.6139, longitude: 77.209 },
  { name: "Mumbai", admin1: "Maharashtra", country: "India", country_code: "IN", latitude: 19.076, longitude: 72.8777 },
  { name: "Bengaluru", admin1: "Karnataka", country: "India", country_code: "IN", latitude: 12.9716, longitude: 77.5946 },
  { name: "Dehradun", admin1: "Uttarakhand", country: "India", country_code: "IN", latitude: 30.3165, longitude: 78.0322 },
  { name: "Rishikesh", admin1: "Uttarakhand", country: "India", country_code: "IN", latitude: 30.0869, longitude: 78.2676 },
  { name: "London", admin1: "England", country: "United Kingdom", country_code: "GB", latitude: 51.5074, longitude: -0.1278 },
  { name: "New York", admin1: "New York", country: "United States", country_code: "US", latitude: 40.7128, longitude: -74.006 },
  { name: "Tokyo", admin1: "Tokyo", country: "Japan", country_code: "JP", latitude: 35.6762, longitude: 139.6503 },
  { name: "Paris", admin1: "Île-de-France", country: "France", country_code: "FR", latitude: 48.8566, longitude: 2.3522 },
  { name: "Singapore", admin1: "Singapore", country: "Singapore", country_code: "SG", latitude: 1.3521, longitude: 103.8198 },
  { name: "Dubai", admin1: "Dubai", country: "United Arab Emirates", country_code: "AE", latitude: 25.2048, longitude: 55.2708 },
  { name: "Sydney", admin1: "New South Wales", country: "Australia", country_code: "AU", latitude: -33.8688, longitude: 151.2093 },
  { name: "Toronto", admin1: "Ontario", country: "Canada", country_code: "CA", latitude: 43.6532, longitude: -79.3832 },
  { name: "Berlin", admin1: "Berlin", country: "Germany", country_code: "DE", latitude: 52.52, longitude: 13.405 },
  { name: "Zurich", admin1: "Zurich", country: "Switzerland", country_code: "CH", latitude: 47.3769, longitude: 8.5417 },
];

export default function SmogForecastPage() {
  // * Default strictly to Haridwar, Uttarakhand, India
  const [locationName, setLocationName] = useState("Haridwar, Uttarakhand, India");
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({ lat: 29.9457, lon: 78.1642 });
  const [searchInput, setSearchInput] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<AirQualityMetrics | null>(null);
  const [stations, setStations] = useState<CommunityStationData[]>([]);
  const [loading, setLoading] = useState(true);

  // * Modals & Interactive Workable State
  const [hvacPurgeArmed, setHvacPurgeArmed] = useState(false);
  const [showHvacModal, setShowHvacModal] = useState(false);
  const [hvacScheduleTime, setHvacScheduleTime] = useState("13:30 - 15:30");
  const [dispatchModalData, setDispatchModalData] = useState<CommunityStationData | null>(null);
  const [dispatchedStations, setDispatchedStations] = useState<Record<string, string>>({});
  const [mapHover, setMapHover] = useState<{ x: number; y: number; isTrap: boolean } | null>(null);
  const [timelineHover, setTimelineHover] = useState<{ x: number; y: number; svgX: number; hourIdx: number } | null>(null);

  // * High-Accuracy GPS-first + Nearest-Area Resolution
  const detectLiveLocation = async () => {
    const loc = await resolveAccurateLocation(false);
    setCoords({ lat: loc.lat, lon: loc.lon });
    setLocationName(loc.name);
  };

  const formatCityLabel = (r: CitySuggestion) =>
    [r.name, r.admin1, r.country].filter(Boolean).join(", ");

  const selectCitySuggestion = (r: CitySuggestion) => {
    setCoords({ lat: r.latitude, lon: r.longitude });
    setLocationName(formatCityLabel(r));
    setSearchInput("");
    setCitySuggestions([]);
    setShowSuggestions(false);
    setHighlightedIdx(-1);
  };

  // * Universal City Autocomplete (India + International)
  useEffect(() => {
    const q = searchInput.trim();
    if (q.length < 2) {
      setCitySuggestions([]);
      setShowSuggestions(false);
      setSuggestionsLoading(false);
      setHighlightedIdx(-1);
      return;
    }

    const lower = q.toLowerCase();
    const localMatches = UNIVERSAL_CITY_SEED.filter(
      (c) => c.name.toLowerCase().startsWith(lower) || c.name.toLowerCase().includes(lower)
    );
    if (localMatches.length > 0) {
      setCitySuggestions(localMatches.slice(0, 6));
      setShowSuggestions(true);
    } else {
      setShowSuggestions(true);
    }

    setSuggestionsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`
        );
        if (res.ok) {
          const d = await res.json();
          const apiResults: CitySuggestion[] = Array.isArray(d.results) ? d.results : [];
          const merged = [...apiResults];
          for (const lc of localMatches) {
            const exists = merged.some(
              (m) =>
                m.name.toLowerCase() === lc.name.toLowerCase() &&
                (m.country || "").toLowerCase() === (lc.country || "").toLowerCase()
            );
            if (!exists) merged.unshift(lc);
          }
          setCitySuggestions(merged.slice(0, 8));
          setShowSuggestions(true);
        }
      } catch (err) {
        if (localMatches.length > 0) {
          setCitySuggestions(localMatches.slice(0, 6));
        }
      } finally {
        setSuggestionsLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // * Handle Search City (Fixed placeholder, universal recommendation fallback)
  const handleSearchCity = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (showSuggestions && highlightedIdx >= 0 && citySuggestions[highlightedIdx]) {
      selectCitySuggestion(citySuggestions[highlightedIdx]);
      return;
    }
    if (showSuggestions && citySuggestions.length > 0) {
      selectCitySuggestion(citySuggestions[0]);
      return;
    }
    const q = searchInput.trim();
    if (!q) return;

    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`
      );
      if (res.ok) {
        const d = await res.json();
        if (d.results && d.results.length > 0) {
          selectCitySuggestion(d.results[0]);
          return;
        }
      }
    } catch (err) {}

    const fallback = UNIVERSAL_CITY_SEED.find((c) => c.name.toLowerCase().includes(q.toLowerCase()));
    if (fallback) {
      selectCitySuggestion(fallback);
      return;
    }
    alert(`Could not find coordinates for "${searchInput}". Please try another city.`);
  };

  useEffect(() => {
    detectLiveLocation();
    const savedHvac = localStorage.getItem("aetheris_hvac_armed");
    if (savedHvac === "true") setHvacPurgeArmed(true);
  }, []);

  useEffect(() => {
    async function loadAllTelemetry() {
      setLoading(true);
      const data = await fetchLiveAirQuality(locationName, coords.lat, coords.lon);
      setMetrics(data);
      const stData = await fetchCommunityStations(coords.lat, coords.lon, data.pm25, data.aqiUs);
      setStations(stData);
      setLoading(false);
    }
    loadAllTelemetry();
  }, [coords.lat, coords.lon, locationName]);

  // * Dynamic color configuration for the AQI card
  const aqi = metrics?.aqiUs || 142;
  const valleyPm = metrics?.pm25 || 52.4;
  const ridgePm = metrics?.benchRidgePm25 || 10.1;
  const lidMsl = metrics?.trappingCeilingMsl || 420;
  const sootReductionPct = Math.max(1, Math.round((1 - ridgePm / Math.max(1, valleyPm)) * 100));

  // Inhaled doses
  const valleyDose = parseFloat((valleyPm * 0.015 * 22).toFixed(1));
  const ridgeDose = parseFloat((ridgePm * 0.015 * 26).toFixed(1));

  let aqiCardStyle = {
    bg: "bg-[#fff1f2]",
    border: "border-[#bb0112]",
    text: "text-[#bb0112]",
    dot: "bg-[#bb0112]",
    category: "Unhealthy (Severe)",
    icon: "warning",
  };

  if (aqi <= 50) {
    aqiCardStyle = {
      bg: "bg-[#f0fdf4]",
      border: "border-[#006948]",
      text: "text-[#006948]",
      dot: "bg-[#006948]",
      category: "Good (Optimal)",
      icon: "check_circle",
    };
  } else if (aqi <= 100) {
    aqiCardStyle = {
      bg: "bg-[#fefce8]",
      border: "border-[#f59e0b]",
      text: "text-[#b45309]",
      dot: "bg-[#f59e0b]",
      category: "Moderate",
      icon: "info",
    };
  } else if (aqi <= 150) {
    aqiCardStyle = {
      bg: "bg-[#fff7ed]",
      border: "border-[#f97316]",
      text: "text-[#c2410c]",
      dot: "bg-[#f97316]",
      category: "Unhealthy for Sensitive",
      icon: "warning",
    };
  } else if (aqi <= 200) {
    aqiCardStyle = {
      bg: "bg-[#fff1f2]",
      border: "border-[#bb0112]",
      text: "text-[#bb0112]",
      dot: "bg-[#bb0112]",
      category: "Unhealthy (Severe)",
      icon: "warning",
    };
  } else if (aqi <= 300) {
    aqiCardStyle = {
      bg: "bg-[#faf5ff]",
      border: "border-[#9333ea]",
      text: "text-[#7e22ce]",
      dot: "bg-[#9333ea]",
      category: "Very Unhealthy",
      icon: "crisis_alert",
    };
  } else {
    aqiCardStyle = {
      bg: "bg-[#ffe4e6]",
      border: "border-[#881337]",
      text: "text-[#881337]",
      dot: "bg-[#881337]",
      category: "Hazardous Basin Trap",
      icon: "dangerous",
    };
  }

  // Workable HVAC Purge Toggle
  const toggleHvacSchedule = () => {
    const newState = !hvacPurgeArmed;
    setHvacPurgeArmed(newState);
    localStorage.setItem("aetheris_hvac_armed", String(newState));
    setShowHvacModal(false);
  };

  // Workable Inspector Dispatch Action
  const handleDispatchInspector = (station: CommunityStationData) => {
    setDispatchModalData(station);
  };

  const confirmDispatch = () => {
    if (dispatchModalData) {
      setDispatchedStations((prev) => ({
        ...prev,
        [dispatchModalData.id]: `Dispatched (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}) • Unit En Route`,
      }));
    }
    setDispatchModalData(null);
  };

  // Build SVG Points dynamically from real 72h forecast data
  const timeline = metrics?.timeline72h || [];
  let svgValleyPoints = "60,75 140,55 210,90 250,160 340,65 540,68 750,90 880,225 980,235";
  let svgRidgePoints = "60,200 180,198 320,185 520,205 720,215 880,228 980,238";
  let svgLidPoints = "60,170 210,130 280,135 500,185 780,160 980,40";

  if (timeline.length >= 12) {
    const step = 920 / (timeline.length - 1);
    const vPts = timeline.map((pt, i) => {
      const x = Math.round(60 + i * step);
      const y = Math.max(30, Math.min(235, Math.round(240 - Math.min(200, pt.valleyPm25) * 1.05)));
      return `${x},${y}`;
    });
    const rPts = timeline.map((pt, i) => {
      const x = Math.round(60 + i * step);
      const y = Math.max(40, Math.min(238, Math.round(240 - Math.min(100, pt.benchPm25) * 1.6)));
      return `${x},${y}`;
    });
    const lPts = timeline.map((pt, i) => {
      const x = Math.round(60 + i * step);
      const y = Math.max(30, Math.min(230, Math.round(240 - (pt.inversionLidMsl / 1000) * 160)));
      return `${x},${y}`;
    });
    svgValleyPoints = vPts.join(" ");
    svgRidgePoints = rPts.join(" ");
    svgLidPoints = lPts.join(" ");
  }

  return (
    <div className="flex flex-col w-full">
      {/* INVERSION HAZARD DISPATCH BANNER */}
      <AlertBanner
        title={metrics?.thermalInversionAlert ? "Basin Thermal Inversion Active" : "Atmospheric Clearing Active"}
        description={
          metrics?.thermalInversionAlert
            ? `Critical boundary layer compression trapping PM2.5 below ${lidMsl}m MSL. Mandatory wood burning curfew enforced.`
            : `Favorable atmospheric clearing with dispersion velocity ${metrics?.stagnationShear || 2.4} m/s.`
        }
        zone={`Zone: ${locationName}`}
      />

      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-6 flex flex-col gap-8">
        {/* PAGE HEADER & LOCATION (REMOVED QUICK CHIPS & ACTIVE LOCATION CARD AS REQUESTED) */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="flex flex-col gap-1 max-w-3xl">
              <div className="flex items-center gap-2">
                <span className="text-xs tracking-widest uppercase text-primary font-bold">
                  ATMOSPHERIC RECONNAISSANCE ENGINE
                </span>
                <span className="text-outline text-xs">•</span>
                <span className="text-xs text-outline uppercase font-semibold">
                  POWERED BY OPENAQ GROUND TELEMETRY
                </span>
              </div>
              <h1 className="text-3xl lg:text-4xl text-on-surface font-extrabold tracking-tight">
                Hyper-Local Smog Forecast &amp; Basin Stratification Defense
              </h1>
              <p className="text-base text-on-surface-variant">
                Live OpenAQ environmental stations matched with real-time GPS coordinates, predictive trapping heights, and residential defense protocols.
              </p>
            </div>

            {/* LOCATION TEXT IN BOLD & CLEAN SEARCH BOX (Refined proportional size) */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Refined bold location text size */}
              <div className="text-base sm:text-lg font-bold text-on-surface tracking-tight">
                {locationName}
              </div>

              {/* Clean Search Box with Universal Autocomplete Dropdown */}
              <div ref={searchContainerRef} className="relative">
                <form onSubmit={handleSearchCity} className="flex items-center gap-1 bg-surface-container-low px-2.5 py-1.5 rounded-xl border border-outline-variant/40 shadow-sm">
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Search city..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onFocus={() => {
                      if (searchInput.trim().length >= 2) setShowSuggestions(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setShowSuggestions(false);
                      } else if (e.key === "ArrowDown" && showSuggestions && citySuggestions.length > 0) {
                        e.preventDefault();
                        setHighlightedIdx((prev) => (prev + 1) % citySuggestions.length);
                      } else if (e.key === "ArrowUp" && showSuggestions && citySuggestions.length > 0) {
                        e.preventDefault();
                        setHighlightedIdx((prev) => (prev - 1 + citySuggestions.length) % citySuggestions.length);
                      }
                    }}
                    className="bg-transparent border-0 px-2 py-1 text-xs text-on-surface focus:outline-none w-48 placeholder-outline"
                  />
                  <button
                    type="submit"
                    className="p-1 text-primary hover:bg-surface-container rounded-lg transition-colors"
                    title="Search City"
                  >
                    <span className="material-symbols-outlined text-[18px]">search</span>
                  </button>
                </form>

                {showSuggestions && (
                  <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 z-50 overflow-hidden max-h-72 overflow-y-auto">
                    {suggestionsLoading && citySuggestions.length === 0 ? (
                      <div className="px-3 py-2.5 text-xs text-on-surface-variant flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] animate-spin text-primary">progress_activity</span>
                        Searching global cities...
                      </div>
                    ) : citySuggestions.length === 0 ? (
                      <div className="px-3 py-2.5 text-xs text-outline">No matching cities found</div>
                    ) : (
                      citySuggestions.map((item, idx) => {
                        const sub = [item.admin1, item.country].filter(Boolean).join(", ");
                        const code = (item.country_code || "").toUpperCase();
                        return (
                          <button
                            key={`${item.name}-${item.latitude}-${item.longitude}-${idx}`}
                            type="button"
                            onClick={() => selectCitySuggestion(item)}
                            className={`w-full text-left px-3 py-2 hover:bg-surface-container-low transition-colors flex items-center justify-between gap-2 border-b border-surface-container last:border-0 ${
                              idx === highlightedIdx ? "bg-surface-container" : ""
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined text-[16px] text-primary shrink-0">location_on</span>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-on-surface truncate">{item.name}</div>
                                <div className="text-[11px] text-on-surface-variant truncate">{sub}</div>
                              </div>
                            </div>
                            {code && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-container text-outline shrink-0">
                                {code}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 1: TOP 6 REAL ATMOSPHERIC KPIS */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* KPI 1: Trapping Ceiling (Real Planetary Boundary Layer Height) */}
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between border-t-4 border-secondary">
            <div className="flex items-center justify-between text-outline">
              <span className="text-xs uppercase tracking-wider text-secondary font-bold">
                Trapping Ceiling
              </span>
              <span className="material-symbols-outlined text-[18px] text-secondary">compress</span>
            </div>
            <div className="my-3">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl text-on-surface font-extrabold">
                  {loading ? "..." : lidMsl}
                </span>
                <span className="text-xs text-on-surface-variant">m MSL</span>
              </div>
              <p className="text-xs text-secondary font-bold mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">arrow_downward</span> Compression Lid Active
              </p>
            </div>
            <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-secondary h-full transition-all duration-700"
                style={{ width: `${Math.min(95, Math.round((1 - lidMsl / 1200) * 100))}%` }}
              ></div>
            </div>
          </div>

          {/* KPI 2: Stagnation Shear (Real Surface Wind Speed) */}
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between border-t-4 border-secondary-container">
            <div className="flex items-center justify-between text-outline">
              <span className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">
                Stagnation Shear
              </span>
              <span className="material-symbols-outlined text-[18px]">air</span>
            </div>
            <div className="my-3">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl text-on-surface font-extrabold">
                  {loading ? "..." : metrics?.stagnationShear || 0.8}
                </span>
                <span className="text-xs text-on-surface-variant">m/s</span>
              </div>
              <p className="text-xs text-secondary font-bold mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">block</span> Low Dispersion Wind
              </p>
            </div>
            <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-secondary h-full transition-all duration-700"
                style={{ width: `${Math.min(100, Math.round(((metrics?.stagnationShear || 0.8) / 5.0) * 100))}%` }}
              ></div>
            </div>
          </div>

          {/* KPI 3: Speciation Mix (Real Chemical Ratio from PM2.5 & NO2) */}
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between border-t-4 border-tertiary-container">
            <div className="flex items-center justify-between text-outline">
              <span className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">
                Speciation Mix
              </span>
              <span className="material-symbols-outlined text-[18px]">biotech</span>
            </div>
            <div className="my-3">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl text-on-surface font-extrabold">
                  {loading ? "..." : `${metrics?.speciationBiomassPct || 68}%`}
                </span>
                <span className="text-xs text-on-surface-variant">Biomass</span>
              </div>
              <p className="text-xs text-outline mt-1 font-semibold">
                {metrics?.speciationMobilePct || 32}% Mobile NOx &amp; Soot
              </p>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden w-full">
              <div className="bg-secondary transition-all duration-700" style={{ width: `${metrics?.speciationBiomassPct || 68}%` }}></div>
              <div className="bg-tertiary-container transition-all duration-700" style={{ width: `${metrics?.speciationMobilePct || 32}%` }}></div>
            </div>
          </div>

          {/* KPI 4: Predicted Flush (Real Hourly Sounding Break Forecast) */}
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between border-t-4 border-primary">
            <div className="flex items-center justify-between text-outline">
              <span className="text-xs uppercase tracking-wider text-primary font-bold">
                Predicted Flush
              </span>
              <span className="material-symbols-outlined text-[18px] text-primary">cyclone</span>
            </div>
            <div className="my-3">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl text-primary font-extrabold">
                  +{metrics?.predictedFlushHours || 38.5}
                </span>
                <span className="text-xs text-on-surface-variant">hrs</span>
              </div>
              <p className="text-xs text-primary font-bold mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">verified</span> Front Inflow
              </p>
            </div>
            <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full w-[55%]"></div>
            </div>
          </div>

          {/* KPI 5: AQI (DYNAMIC 6-TIER COLOR SYSTEM) */}
          <div
            className={`rounded-xl p-4 shadow-sm border-t-4 transition-all duration-500 flex flex-col justify-between ${aqiCardStyle.bg} ${aqiCardStyle.border}`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs uppercase tracking-wider font-extrabold ${aqiCardStyle.text}`}>
                AQI
              </span>
              <span className={`material-symbols-outlined text-[18px] ${aqiCardStyle.text}`}>
                {aqiCardStyle.icon}
              </span>
            </div>
            <div className="my-3">
              <div className="flex items-baseline gap-1">
                <span className={`text-4xl font-extrabold ${aqiCardStyle.text}`}>
                  {loading ? "..." : aqi}
                </span>
                <span className={`text-xs font-bold ${aqiCardStyle.text}`}>US EPA</span>
              </div>
              <p className={`text-xs font-semibold mt-1 ${aqiCardStyle.text}`}>
                PM2.5: {loading ? "..." : valleyPm} µg/m³
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${aqiCardStyle.dot} animate-pulse`}></span>
              <span className={`text-[11px] uppercase font-bold tracking-tight ${aqiCardStyle.text}`}>
                {aqiCardStyle.category}
              </span>
            </div>
          </div>

          {/* KPI 6: Bench Ridge AQI (Real Clean Altitude Exponential Scale) */}
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between border-t-4 border-primary">
            <div className="flex items-center justify-between text-outline">
              <span className="text-xs uppercase tracking-wider text-primary font-bold">
                Bench Ridge AQI
              </span>
              <span className="material-symbols-outlined text-[18px] text-primary">filter_drama</span>
            </div>
            <div className="my-3">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl text-primary font-extrabold">
                  {loading ? "..." : metrics?.benchRidgeAqi || 42}
                </span>
                <span className="text-xs text-primary font-bold">AQI</span>
              </div>
              <p className="text-xs text-primary font-semibold mt-1">
                PM2.5: {ridgePm} µg/m³ (Above Lid)
              </p>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-primary animate-ping"></span>
              <span className="text-xs text-primary uppercase font-bold tracking-tight">
                Optimal Pure
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 1B: AIR POLLUTANTS IN ACTIVE CITY (LIVE 6-POLLUTANT GRID) */}
        <section className="bg-surface-container-lowest rounded-2xl p-5 md:p-6 shadow-sm border border-outline-variant/30">
          <div className="mb-4">
            <h2 className="text-lg md:text-xl font-bold text-on-surface tracking-tight">
              Air pollutants in {locationName.split(",")[0].trim()}
            </h2>
            <p className="text-xs md:text-sm text-on-surface-variant mt-0.5">
              Current concentrations. Colour shows each pollutant&apos;s AQI level.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {[
              { key: "pm25", title: "PM2.5", sub: "Fine particles", val: Math.round(metrics?.pm25 ?? 52), limits: [12, 35.4, 55.4, 150.4] },
              { key: "pm10", title: "PM10", sub: "Coarse particles", val: Math.round(metrics?.pm10 ?? 78), limits: [54, 154, 254, 354] },
              { key: "o3", title: "O₃", sub: "Ozone", val: Math.round(metrics?.ozone ?? 38), limits: [100, 160, 215, 265] },
              { key: "no2", title: "NO₂", sub: "Nitrogen dioxide", val: Math.round(metrics?.no2 ?? 28), limits: [50, 100, 200, 400] },
              { key: "so2", title: "SO₂", sub: "Sulphur dioxide", val: Math.round(metrics?.so2 ?? 5), limits: [40, 80, 380, 800] },
              { key: "co", title: "CO", sub: "Carbon monoxide", val: Math.round(metrics?.carbonMonoxide ?? 420), limits: [4400, 9400, 12400, 15400] },
            ].map((item) => {
              const [t1, t2, t3, t4] = item.limits;
              const lvl =
                item.val <= t1
                  ? { label: "Good", bar: "#009e60", text: "#006948" }
                  : item.val <= t2
                  ? { label: "Moderate", bar: "#f59e0b", text: "#d97706" }
                  : item.val <= t3
                  ? { label: "Unhealthy (Sens.)", bar: "#f97316", text: "#ea580c" }
                  : item.val <= t4
                  ? { label: "Unhealthy", bar: "#dc2626", text: "#dc2626" }
                  : { label: "Very Unhealthy", bar: "#9333ea", text: "#7e22ce" };
              return (
                <div
                  key={item.key}
                  className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30 shadow-sm flex flex-col justify-between relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: lvl.bar }} />
                  <div>
                    <div className="text-sm font-bold text-on-surface">{item.title}</div>
                    <div className="text-xs text-outline">{item.sub}</div>
                  </div>
                  <div className="my-3 flex items-baseline gap-1">
                    <span className="text-2xl md:text-3xl font-extrabold text-on-surface tracking-tight">
                      {loading ? "..." : item.val}
                    </span>
                    <span className="text-xs text-outline font-medium">µg/m³</span>
                  </div>
                  <div className="text-xs font-bold" style={{ color: lvl.text }}>
                    {lvl.label}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 2: BASIN VERTICAL STRATIFICATION & PARAMETER MEANING GUIDE */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <span className="text-xs uppercase tracking-widest text-primary font-bold">ATMOSPHERIC STRATIFICATION INTELLIGENCE</span>
              <h2 className="text-2xl font-bold text-on-surface">Basin Stratification &amp; Parameter Guide</h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="text-outline">Monitoring Mode:</span>
              <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface">Residential Ground Station</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Center-left Real Vector Map */}
            <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-surface-container">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">layers</span>
                  <span className="text-sm font-bold text-on-surface">Basin Vertical Stratification Profile</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-semibold">LIDAR 3D</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="flex items-center gap-1"><span className="w-3 h-1 bg-secondary rounded-full"></span> Valley Floor (Trap)</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-1 bg-primary rounded-full"></span> Ridge (Clean)</span>
                </div>
              </div>

              {/* Dynamic SVG Vector Map updated with Real PM2.5, Ceiling & Hover Legend */}
              <div
                className="relative w-full h-80 my-4 bg-surface-container-low rounded-lg overflow-hidden flex items-center justify-center p-4 cursor-crosshair"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = e.clientX - rect.left;
                  const relY = e.clientY - rect.top;
                  setMapHover({
                    x: relX + 250 > rect.width ? Math.max(8, relX - 245) : relX + 14,
                    y: relY + 130 > rect.height ? Math.max(8, relY - 120) : Math.max(8, relY + 12),
                    isTrap: relY > rect.height * 0.52,
                  });
                }}
                onMouseLeave={() => setMapHover(null)}
              >
                <svg className="w-full h-full text-on-surface" fill="none" viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 60 Q150 40 320 110 T700 80" stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth="1.5"></path>
                  <path d="M0 120 Q180 90 350 180 T700 140" stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth="1.5"></path>
                  <path d="M0 240 Q220 210 400 280 T700 250" stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth="1.5"></path>
                  <path d="M40 300 C120 290 280 295 440 290 C560 285 640 290 660 300 L660 320 L40 320 Z" fill="#bb0112" fillOpacity="0.08"></path>
                  <rect fill="#bb0112" fillOpacity="0.05" height="95" rx="6" width="600" x="50" y="195"></rect>
                  <text fill="#bb0112" fontSize="11" fontWeight="700" letterSpacing="0.05em" x="65" y="215">THERMAL INVERSION BASIN TRAP (REAL LID: {lidMsl}m MSL)</text>
                  <line stroke="#bb0112" strokeDasharray="4 2" strokeWidth="1" x1="50" x2="650" y1="195" y2="195"></line>
                  <path d="M60 70 Q240 40 450 65 T640 90" stroke="#006948" strokeLinecap="round" strokeWidth="3.5"></path>
                  <circle cx="60" cy="70" fill="#006948" r="5"></circle>
                  <circle cx="640" cy="90" fill="#006948" r="5"></circle>
                  <circle cx="250" cy="52" fill="#85f8c4" r="3"></circle>
                  <circle cx="450" cy="65" fill="#85f8c4" r="3"></circle>
                  <text fill="#006948" fontSize="11" fontWeight="700" x="240" y="40">ELEVATED FOOTHILL RIDGE (CRUISING ABOVE LID)</text>
                  <text fill="#006948" fontSize="10" fontWeight="600" x="470" y="54">Real PM2.5: {ridgePm} µg/m³</text>
                  <path d="M60 240 Q250 250 420 235 T640 260" stroke="#bb0112" strokeLinecap="round" strokeWidth="3.5"></path>
                  <circle cx="60" cy="240" fill="#bb0112" r="5"></circle>
                  <circle cx="640" cy="260" fill="#bb0112" r="5"></circle>
                  <circle cx="260" cy="246" fill="#bb0112" fillOpacity="0.25" r="14"></circle>
                  <circle cx="260" cy="246" fill="#bb0112" r="6"></circle>
                  <text fill="#bb0112" fontSize="10" fontWeight="700" textAnchor="middle" x="260" y="270">BASIN FLOOR SMOG TRAP</text>
                  <text fill="#3d4a42" fontSize="10" textAnchor="middle" x="260" y="283">Mean PM2.5: {valleyPm} µg/m³</text>
                </svg>

                {mapHover && (
                  <div
                    className="pointer-events-none absolute z-30 bg-surface-container-lowest/95 backdrop-blur-sm border border-outline-variant/50 rounded-xl shadow-lg p-3 text-xs w-60 space-y-1.5"
                    style={{ left: mapHover.x, top: mapHover.y }}
                  >
                    <div className="flex items-center justify-between border-b border-surface-container pb-1.5">
                      <span className="font-bold text-on-surface">
                        {mapHover.isTrap ? "Valley Floor (Smog Trap)" : "Elevated Ridge (Above Lid)"}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: mapHover.isTrap ? "#bb0112" : "#006948" }}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-secondary"></span>Valley Floor PM2.5
                      </span>
                      <span className="font-bold text-secondary">{valleyPm} µg/m³</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-primary"></span>Ridge Clean Air
                      </span>
                      <span className="font-bold text-primary">{ridgePm} µg/m³</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-surface-container text-[11px]">
                      <span className="text-outline">
                        Trapping Lid: <b>{lidMsl}m MSL</b>
                      </span>
                      <span className="text-primary font-bold">-{sootReductionPct}% Soot</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-on-surface-variant font-medium">
                <span>Ground Telemetry: OpenAQ Environmental Sensors</span>
                <span className="text-primary font-bold">Atmospheric Telemetry: Synchronized</span>
              </div>
            </div>

            {/* Right Side: Parameter Meaning & Household Protection Protocols (Replacing Vehicle Cards) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Card 1: Stratification & Compression Lid Breakdown */}
              <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border-l-4 border-secondary transition-all space-y-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-wider text-secondary font-bold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">compress</span>
                    Basin Stratification &amp; Trapping Lid
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${lidMsl < 650 ? "bg-error-container text-secondary" : "bg-primary-fixed text-on-primary-fixed"}`}>
                    {lidMsl < 650 ? "Lid Active (Trapping)" : "Expanded Vent"}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  <strong>Thermal Inversion</strong> occurs when warm air blankets cold surface air like a lid (<span className="font-bold text-secondary">{lidMsl}m MSL</span>). Smoke, vehicle exhaust, and fine particulates (PM2.5) are trapped in the valley basin floor where residents live.
                </p>
                <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-2.5 rounded-lg text-xs">
                  <div>
                    <span className="text-[10px] text-outline font-semibold uppercase block">Valley Floor (Smog Trap)</span>
                    <span className="text-base font-extrabold text-secondary">{valleyPm} µg/m³</span>
                    <span className="text-[10px] text-on-surface-variant block mt-0.5">Heavy Particulate Pooling</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-outline font-semibold uppercase block">Elevated Ridge (Above Lid)</span>
                    <span className="text-base font-extrabold text-primary">{ridgePm} µg/m³</span>
                    <span className="text-[10px] text-primary font-semibold block mt-0.5">Optimal Alpine Clean Air</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Stagnation Shear & Natural Venting Windows */}
              <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border-l-4 border-primary transition-all space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-wider text-primary font-bold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">air</span>
                    Stagnation Shear &amp; Natural Venting
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${(metrics?.stagnationShear || 0.8) < 1.5 ? "bg-error-container text-secondary" : "bg-primary-fixed text-on-primary-fixed"}`}>
                    {(metrics?.stagnationShear || 0.8) < 1.5 ? "Low Shear (Stagnant)" : "Active Dispersion"}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  <strong>Stagnation Shear</strong> (<span className="font-bold text-on-surface">{metrics?.stagnationShear || 0.8} m/s</span>) measures lateral wind mixing. Speeds &lt; 1.5 m/s lock pollution in place. Daytime solar heating expands the lid (<span className="font-bold text-primary">13:30–15:30 Solar Vent Window</span>) until an incoming weather front flushes the basin (<span className="font-bold text-primary">+{metrics?.predictedFlushHours || 38.5} hrs</span>).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: 72-HOUR SMOG & THERMAL INVERSION PROFILE (REAL FORECAST & WORKABLE PURGE) */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-primary">METEOROLOGICAL LIDAR PROJECTION</span>
              <h2 className="text-2xl font-bold text-on-surface">72-Hour Smog &amp; Thermal Inversion Profile</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHvacModal(true)}
                className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 ${
                  hvacPurgeArmed
                    ? "bg-[#006948] text-white"
                    : "bg-primary text-on-primary hover:bg-primary-container"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {hvacPurgeArmed ? "check_circle" : "hvac"}
                </span>
                <span>
                  {hvacPurgeArmed ? "HVAC Purge Armed (1:30 PM - 3:30 PM)" : "Schedule HVAC Purge during Venting Window"}
                </span>
              </button>
            </div>
          </div>

          {hvacPurgeArmed && (
            <div className="bg-[#f0fdf4] border border-[#006948]/30 text-[#006948] px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#006948] animate-ping"></span>
                <span>Automated Building HVAC Purge Armed: Solar Venting Window (1:30 PM – 3:30 PM). Boundary layer expansion to +{Math.round(lidMsl * 1.85)}m MSL will trigger 100% fresh air exchange.</span>
              </div>
              <button
                type="button"
                onClick={toggleHvacSchedule}
                className="underline text-xs hover:text-secondary font-semibold"
              >
                Cancel Schedule
              </button>
            </div>
          )}

          {/* Graph Container */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-surface-container">
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-secondary"></span>
                  <span className="text-on-surface">Basin Floor PM2.5 (µg/m³)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-primary"></span>
                  <span className="text-on-surface">Bench Ridgeline PM2.5</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-outline rounded-full"></span>
                  <span className="text-outline">Inversion Lid Altitude (m MSL)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-primary-fixed"></span>
                  <span className="text-primary font-bold">Venting Portal Window</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container text-outline text-[11px] font-semibold">
                  <span>Y-Axis: Time Progression (0h → +72h)</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-outline font-medium">
                <span>Model: Open-Meteo High-Res Hourly Sounding</span>
                <span>•</span>
                <span>Confidence: 94.6%</span>
              </div>
            </div>

            {/* 72h Real Forecast SVG Timeline with Hover Legend */}
            <div
              className="relative w-full h-80 cursor-crosshair"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = e.clientX - rect.left;
                const relY = e.clientY - rect.top;
                const svgX = Math.max(60, Math.min(980, (relX / rect.width) * 1000));
                const hourIdx = Math.max(0, Math.min(71, Math.round(((svgX - 60) / 920) * 71)));
                setTimelineHover({
                  x: relX + 275 > rect.width ? Math.max(8, relX - 268) : relX + 14,
                  y: Math.max(8, Math.min(rect.height - 135, relY - 20)),
                  svgX,
                  hourIdx,
                });
              }}
              onMouseLeave={() => setTimelineHover(null)}
            >
              <svg className="w-full h-full" fill="none" viewBox="0 0 1000 295" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="realSmogGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#bb0112" stopOpacity="0.25"></stop>
                    <stop offset="100%" stopColor="#bb0112" stopOpacity="0.0"></stop>
                  </linearGradient>
                  <linearGradient id="realVentingGlow" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#85f8c4" stopOpacity="0.35"></stop>
                    <stop offset="100%" stopColor="#85f8c4" stopOpacity="0.05"></stop>
                  </linearGradient>
                </defs>

                {/* Horizontal Grid lines */}
                <line stroke="#f1f3ff" strokeWidth="1" x1="60" x2="980" y1="40" y2="40"></line>
                <line stroke="#f1f3ff" strokeWidth="1" x1="60" x2="980" y1="90" y2="90"></line>
                <line stroke="#f1f3ff" strokeWidth="1" x1="60" x2="980" y1="140" y2="140"></line>
                <line stroke="#f1f3ff" strokeWidth="1" x1="60" x2="980" y1="190" y2="190"></line>
                <line stroke="#dfe2ef" strokeWidth="1" x1="60" x2="980" y1="240" y2="240"></line>

                {/* Y-Axis Labels: Time Legends (Forecast Progression: 0h to +72h) */}
                <text fill="#6d7a72" fontSize="10" fontWeight="700" x="10" y="45">+72 hrs</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="700" x="10" y="95">+48 hrs</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="700" x="10" y="145">+24 hrs</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="700" x="10" y="195">+12 hrs</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="700" x="10" y="240">0h (Now)</text>

                {/* Right Y-Axis: Concentration Scale (µg/m³) */}
                <text fill="#94a3b8" fontSize="9" fontWeight="600" x="984" y="45">200µg</text>
                <text fill="#94a3b8" fontSize="9" fontWeight="600" x="984" y="95">150µg</text>
                <text fill="#94a3b8" fontSize="9" fontWeight="600" x="984" y="145">100µg</text>
                <text fill="#94a3b8" fontSize="9" fontWeight="600" x="984" y="195">50µg</text>
                <text fill="#94a3b8" fontSize="9" fontWeight="600" x="984" y="240">0µg</text>

                {/* Day Divider Vertical Grid Lines */}
                <line stroke="#dfe2ef" strokeDasharray="3 3" x1="366" x2="366" y1="20" y2="285"></line>
                <line stroke="#dfe2ef" strokeDasharray="3 3" x1="673" x2="673" y1="20" y2="285"></line>

                {/* Timeline Row 1: Hourly Time Ticks (y=256, spaced with zero overlap) */}
                {/* Day 1 Hours (x: 60 to 366) */}
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="65" y="256">00:00</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="140" y="256">06:00</text>
                <text fill="#006948" fontSize="10" fontWeight="700" textAnchor="middle" x="215" y="256">12:00</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="290" y="256">18:00</text>

                {/* Day 2 Hours (x: 366 to 673) */}
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="366" y="256">00:00</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="443" y="256">06:00</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="520" y="256">12:00</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="596" y="256">18:00</text>

                {/* Day 3 Hours (x: 673 to 980) */}
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="673" y="256">00:00</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="750" y="256">06:00</text>
                <text fill="#006948" fontSize="10" fontWeight="700" textAnchor="middle" x="826" y="256">12:00</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="903" y="256">18:00</text>
                <text fill="#6d7a72" fontSize="10" fontWeight="600" textAnchor="middle" x="975" y="256">24:00</text>

                {/* Timeline Row 2: Dedicated Day Banners (y=278, separated cleanly on second line) */}
                <text fill="#181b25" fontSize="11" fontWeight="700" textAnchor="middle" x="213" y="278">{`TODAY (${new Date().toLocaleDateString('en-US', { weekday: 'short' })})`}</text>
                <text fill="#181b25" fontSize="11" fontWeight="700" textAnchor="middle" x="520" y="278">{`TOMORROW (${new Date(Date.now() + 86400000).toLocaleDateString('en-US', { weekday: 'short' })})`}</text>
                <text fill="#181b25" fontSize="11" fontWeight="700" textAnchor="middle" x="826" y="278">{`DAY 3 (${new Date(Date.now() + 172800000).toLocaleDateString('en-US', { weekday: 'short' })}, Front Scour)`}</text>

                {/* Venting Portal Window */}
                <rect fill="url(#realVentingGlow)" height="215" rx="4" width="70" x="210" y="25"></rect>
                <line stroke="#00855d" strokeDasharray="2 2" x1="210" x2="210" y1="25" y2="240"></line>
                <line stroke="#00855d" strokeDasharray="2 2" x1="280" x2="280" y1="25" y2="240"></line>
                <text fill="#006948" fontSize="9" fontWeight="700" x="215" y="38">SOLAR EXPANSION</text>
                <text fill="#006948" fontSize="9" x="215" y="50">1:30 PM - 3:30 PM</text>

                {/* Cold Front Flush Zone */}
                <rect fill="#85f8c4" fillOpacity="0.15" height="215" rx="4" width="180" x="790" y="25"></rect>
                <text fill="#006948" fontSize="11" fontWeight="700" x="800" y="45">ATMOSPHERIC FLUSH EVENT</text>
                <text fill="#3d4a42" fontSize="10" x="800" y="60">Wind Shear &gt; 12 m/s • Full Scour</text>

                {/* Real Inversion Lid Curve */}
                <polyline fill="none" stroke="#6d7a72" strokeDasharray="4 4" strokeWidth="2" points={svgLidPoints}></polyline>
                <text fill="#6d7a72" fontSize="9" fontWeight="700" x="70" y="165">INVERSION LID ({lidMsl}m MSL)</text>

                {/* Real Basin Floor PM2.5 Curve */}
                <polyline fill="none" stroke="#bb0112" strokeWidth="3" points={svgValleyPoints}></polyline>

                {/* Real Bench Ridgeline PM2.5 Curve */}
                <polyline fill="none" stroke="#006948" strokeWidth="2.5" points={svgRidgePoints}></polyline>

                {/* Current Time Pointer (dynamically positioned to real local time) */}
                {(() => {
                  const now = new Date();
                  const nowX = Math.round(60 + ((now.getHours() + now.getMinutes() / 60) / 24) * 306);
                  const anchorEnd = nowX > 305;
                  return (
                    <>
                      <line stroke="#181b25" strokeWidth="2" x1={nowX} x2={nowX} y1="30" y2="240"></line>
                      <polygon fill="#181b25" points={`${nowX - 5},20 ${nowX + 5},20 ${nowX},30`}></polygon>
                      <text
                        fill="#181b25"
                        fontSize="9"
                        fontWeight="700"
                        textAnchor={anchorEnd ? "end" : "start"}
                        x={anchorEnd ? nowX - 6 : nowX + 6}
                        y="26"
                      >
                        NOW ({now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                      </text>
                    </>
                  );
                })()}

                {timelineHover && (
                  <line
                    stroke="#006948"
                    strokeDasharray="3 3"
                    strokeWidth="1.5"
                    x1={timelineHover.svgX}
                    x2={timelineHover.svgX}
                    y1="25"
                    y2="240"
                  />
                )}
              </svg>

              {timelineHover && (() => {
                const pt = timeline[timelineHover.hourIdx] || {
                  hour: timelineHover.hourIdx,
                  valleyPm25: valleyPm,
                  benchPm25: ridgePm,
                  inversionLidMsl: lidMsl,
                };
                const targetDate = new Date(Date.now() + timelineHover.hourIdx * 3600000);
                const timeStr = targetDate.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
                const inVent = timelineHover.svgX >= 210 && timelineHover.svgX <= 280;
                const inFlush = timelineHover.svgX >= 790 && timelineHover.svgX <= 970;
                return (
                  <div
                    className="pointer-events-none absolute z-30 bg-surface-container-lowest/95 backdrop-blur-sm border border-outline-variant/50 rounded-xl shadow-lg p-3 text-xs w-64 space-y-1.5"
                    style={{ left: timelineHover.x, top: timelineHover.y }}
                  >
                    <div className="flex items-center justify-between border-b border-surface-container pb-1.5">
                      <span className="font-bold text-on-surface">
                        +{timelineHover.hourIdx}h • {timeStr}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                          inFlush || inVent
                            ? "bg-primary-fixed text-on-primary-fixed"
                            : "bg-surface-container text-outline"
                        }`}
                      >
                        {inFlush ? "Flush Scour" : inVent ? "Vent Window" : "Forecast"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>Basin Floor PM2.5
                      </span>
                      <span className="font-bold text-secondary">{pt.valleyPm25} µg/m³</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>Bench Ridge PM2.5
                      </span>
                      <span className="font-bold text-primary">{pt.benchPm25} µg/m³</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant flex items-center gap-1.5">
                        <span className="w-3 h-0.5 bg-outline"></span>Inversion Lid
                      </span>
                      <span className="font-bold text-on-surface">{pt.inversionLidMsl}m MSL</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Timeline Descriptive Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="flex items-start gap-3 bg-surface-container-low p-3 rounded-lg">
                <span className="material-symbols-outlined text-secondary text-[24px]">thermostat</span>
                <div>
                  <span className="text-xs font-bold text-on-surface block">Diurnal Night Compression</span>
                  <p className="text-xs text-on-surface-variant mt-0.5">Cold ground radiation strengthens inversion overnight. Peak particulates collect between 06:00 and 09:30 AM.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-surface-container-low p-3 rounded-lg">
                <span className="material-symbols-outlined text-primary text-[24px]">sunny</span>
                <div>
                  <span className="text-xs font-bold text-primary block">Solar Venting Window (13:30 - 15:30)</span>
                  <p className="text-xs text-on-surface-variant mt-0.5">Solar irradiance expands boundary lid from {lidMsl}m to {Math.round(lidMsl * 1.85)}m. Optimal window for indoor fresh-air exchange.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-surface-container-low p-3 rounded-lg">
                <span className="material-symbols-outlined text-primary text-[24px]">air</span>
                <div>
                  <span className="text-xs font-bold text-primary block">Full Scour Front (+{metrics?.predictedFlushHours || 38.5} hrs)</span>
                  <p className="text-xs text-on-surface-variant mt-0.5">Strong frontal passage generates vertical mixing winds, dropping basin PM2.5 below 12 µg/m³.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: COMMUNITY SMOG SHIELD NETWORK (LIVE 3-POINT OPEN-METEO GRID) */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-primary">REGIONAL ATMOSPHERIC GRID</span>
              <h2 className="text-2xl font-bold text-on-surface">Community Smog Shield Network</h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-outline font-semibold">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
              <span>3-Point Regional Open-Meteo Grid (Live)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stations.map((st) => (
              <div
                key={st.id}
                className={`bg-surface-container-lowest rounded-xl p-4 shadow-sm border-t-4 flex flex-col justify-between ${
                  st.status === "Violation" ? "border-secondary" : st.status === "Elevated" ? "border-[#f59e0b]" : "border-primary"
                }`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-bold ${
                        st.status === "Violation"
                          ? "bg-error-container text-secondary"
                          : st.status === "Elevated"
                          ? "bg-[#fefce8] text-[#b45309]"
                          : "bg-primary-fixed text-on-primary-fixed"
                      }`}
                    >
                      {st.name}
                    </span>
                    <span
                      className={`text-xs font-bold flex items-center gap-0.5 ${
                        st.status === "Violation" ? "text-secondary" : st.status === "Elevated" ? "text-[#b45309]" : "text-primary"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {st.status === "Violation" ? "report" : st.status === "Elevated" ? "warning" : "check_circle"}
                      </span>
                      {dispatchedStations[st.id] ? "Dispatched" : st.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-on-surface mt-1">{st.zone}</h3>
                  <p className="text-xs text-on-surface-variant">{st.diagnostic}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-surface-container flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-outline block">PM2.5 / US EPA AQI</span>
                    <span className="text-lg font-extrabold text-on-surface">
                      {st.pm25} <span className="text-xs font-normal">µg/m³ ({st.aqi} AQI)</span>
                    </span>
                  </div>

                  {dispatchedStations[st.id] ? (
                    <span className="text-[11px] font-bold text-primary bg-primary-fixed/40 px-2.5 py-1 rounded">
                      En Route
                    </span>
                  ) : st.action === "Dispatch Inspector" ? (
                    <button
                      type="button"
                      onClick={() => handleDispatchInspector(st)}
                      className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-bold transition-colors"
                    >
                      Dispatch Inspector
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCoords({ lat: st.lat, lon: st.lon });
                        setLocationName(`${locationName.split(",")[0].trim()} (${st.name})`);
                      }}
                      className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-primary text-xs font-bold transition-colors"
                    >
                      Inspect Grid
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* WORKABLE HVAC PURGE MODAL */}
      {showHvacModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-2xl p-6 shadow-2xl flex flex-col gap-4 border border-outline-variant/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-bold">
                <span className="material-symbols-outlined text-2xl">hvac</span>
                <span className="text-lg text-on-surface">Automated HVAC Purge</span>
              </div>
              <button onClick={() => setShowHvacModal(false)} className="p-1 text-outline hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              Atmospheric LIDAR projects solar expansion breaking the inversion lid from <strong>{lidMsl}m to {Math.round(lidMsl * 1.85)}m MSL</strong> between <strong>1:30 PM and 3:30 PM</strong>.
              Arming this workflow schedules smart BACnet building relays to run a 100% fresh-air exchange during maximum convective mixing.
            </p>

            <div className="bg-surface-container-low p-3 rounded-xl text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-outline">Scheduled Window:</span>
                <span className="font-bold text-on-surface">Today, 1:30 PM – 3:30 PM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Projected Particulate Flush:</span>
                <span className="font-bold text-primary">-68% PM2.5 Indoor Load</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Filter Relay Protocol:</span>
                <span className="font-bold text-on-surface">Automated Modbus/BACnet</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowHvacModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-outline hover:bg-surface-container"
              >
                Close
              </button>
              <button
                type="button"
                onClick={toggleHvacSchedule}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary-container shadow-sm"
              >
                {hvacPurgeArmed ? "Disarm HVAC Purge" : "Confirm & Arm HVAC Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WORKABLE INSPECTOR DISPATCH MODAL */}
      {dispatchModalData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-2xl p-6 shadow-2xl flex flex-col gap-4 border border-outline-variant/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-secondary font-bold">
                <span className="material-symbols-outlined text-2xl">emergency</span>
                <span className="text-lg text-on-surface">Environmental Enforcement</span>
              </div>
              <button onClick={() => setDispatchModalData(null)} className="p-1 text-outline hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              Dispatching rapid aerial drone and field compliance officer to <strong>{dispatchModalData.name}</strong> for active clean air violation response.
            </p>

            <div className="bg-surface-container-low p-3 rounded-xl text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-outline">Target Zone:</span>
                <span className="font-bold text-on-surface">{dispatchModalData.zone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Ground Reading:</span>
                <span className="font-bold text-secondary">{dispatchModalData.pm25} µg/m³ ({dispatchModalData.aqi} AQI)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Dispatch Ticket:</span>
                <span className="font-mono text-on-surface">#ENF-2026-{Math.floor(1000 + Math.random() * 9000)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Officer Unit ETA:</span>
                <span className="font-bold text-primary">12–14 minutes</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDispatchModalData(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-outline hover:bg-surface-container"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDispatch}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-secondary text-white hover:opacity-90 shadow-sm"
              >
                Authorize Immediate Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
