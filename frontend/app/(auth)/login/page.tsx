"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { localLogin } from "@/lib/localAuth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await localLogin(username, password);
    setLoading(false);

    if (res.success) {
      router.push("/forecast");
    } else {
      setError(res.error || "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-lg border border-outline-variant/30 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-2">
            <span className="material-symbols-outlined text-3xl">admin_panel_settings</span>
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Aetheris Admin Login</h1>
          <p className="font-body-sm text-on-surface-variant">
            CleanBreathe AI Navigator — Atmospheric Reconnaissance
          </p>
        </div>

        {error && (
          <div className="p-3 bg-error-container text-on-error-container rounded-lg font-body-sm text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-label-md text-on-surface mb-1" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-outline-variant bg-surface text-on-surface focus:outline-none focus:ring-2 focus:ring-primary font-body-md font-semibold"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="block font-label-md text-on-surface mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-outline-variant bg-surface text-on-surface focus:outline-none focus:ring-2 focus:ring-primary font-body-md"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-primary text-on-primary font-label-lg rounded-xl hover:bg-primary-container transition-colors font-semibold shadow-sm disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In as Admin"}
          </button>
        </form>

        {/* TODO: Re-enable self-service registration when Auth0 / multi-tenant database is provisioned */}
        <div className="pt-4 border-t border-outline-variant/30 text-center space-y-3">
          <div className="p-3 bg-surface-container rounded-lg text-left border border-outline-variant/20">
            <p className="font-label-sm uppercase text-outline mb-1 font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-secondary">lock</span>
              Account Creation Disabled
            </p>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Public registration is disabled. Use the active <code>admin / admin</code> credentials to access the platform.
            </p>
          </div>
          <button
            disabled
            className="w-full py-2 font-body-sm text-xs text-outline font-medium opacity-60 cursor-not-allowed bg-surface-container-low rounded-lg"
          >
            {/* // TODO: Re-enable create account link */}
            + Create New Account (Disabled)
          </button>
        </div>
      </div>
    </div>
  );
}
