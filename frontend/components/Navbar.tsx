"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { getLocalSession, localLogout, UserProfile } from "@/lib/localAuth";

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    setUser(getLocalSession());
  }, []);

  const navLinks = [
    { label: "Smog Forecast", path: "/forecast" },
    { label: "AI Air Nav", path: "/ai-nav" },
    { label: "Action Workflows", path: "/workflows" },
    { label: "Impact Metrics", path: "/metrics" },
    // Disabled and hidden for now:
    // { label: "Pricing & Community", path: "/pricing" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-16 w-full max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop flex items-center justify-between gap-gutter">
        <div className="flex items-center gap-space-lg">
          <Link
            href="/forecast"
            className="font-headline-md text-headline-md text-on-surface tracking-tight hover:opacity-90 transition-opacity"
          >
            Aetheris
          </Link>
        </div>

        <nav className="hidden lg:flex items-center gap-space-xs p-space-xs">
          {navLinks.map((link) => {
            const isActive = pathname === link.path || (link.path === "/forecast" && pathname === "/");
            return (
              <Link
                key={link.path}
                href={link.path}
                className={`px-space-md py-space-sm font-label-md text-label-md rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary-container text-on-primary-container font-label-md"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-space-md">
          <button
            aria-label="Notifications"
            className="p-space-xs rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-space-md py-space-xs rounded-full bg-surface-container-low font-label-md text-label-md text-on-surface hover:bg-surface-container transition-colors"
              >
                {user.displayName || "admin"}
              </Link>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-space-md py-space-xs rounded-full bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
