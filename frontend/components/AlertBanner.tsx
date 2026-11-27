"use client";

import { useState } from "react";

interface AlertBannerProps {
  title?: string;
  description?: string;
  zone?: string;
}

export default function AlertBanner({
  title = "Basin Thermal Inversion Active",
  description = "Critical boundary layer compression trapping PM2.5 below 420m MSL. Mandatory wood burning curfew enforced.",
  zone = "Zone 04: Wasatch Low Basin",
}: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="w-full bg-error-container text-on-error-container px-margin md:px-margin-tablet lg:px-margin-desktop py-space-sm shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-secondary text-[20px] animate-pulse">
            crisis_alert
          </span>
          <span className="font-label-md text-label-md tracking-wide uppercase text-secondary">
            {title}
          </span>
          <span className="hidden md:inline text-outline-variant">|</span>
          <span className="font-body-sm text-body-sm text-on-error-container">
            {description}
          </span>
        </div>
        <div className="flex items-center gap-space-sm self-end md:self-auto">
          <span className="font-label-sm text-label-sm bg-surface-container-lowest/80 text-secondary px-space-sm py-space-xs rounded">
            {zone}
          </span>
          <button
            aria-label="Dismiss alert"
            className="p-space-xs text-on-surface-variant hover:text-on-surface transition-colors"
            onClick={() => setDismissed(true)}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
