"use client";

import Link from "next/link";

// TODO: Re-enable self-service registration when Auth0 / multi-tenant database is provisioned
export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-lg border border-outline-variant/30 p-8 space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-secondary/10 text-secondary mb-2">
          <span className="material-symbols-outlined text-3xl">lock</span>
        </div>
        <h1 className="font-headline-md text-headline-md text-on-surface">Registration Disabled</h1>
        <p className="font-body-sm text-on-surface-variant">
          {/* TODO: Re-enable self-service registration */}
          Public self-service account registration is currently disabled for this phase. Please log in using the administrator credentials.
        </p>

        <div className="p-4 bg-surface-container-low rounded-xl text-left border border-outline-variant/30 space-y-1">
          <p className="font-label-sm uppercase text-outline font-bold">Admin Credentials:</p>
          <p className="font-body-sm text-xs text-on-surface">Username: <code className="font-bold text-primary">admin</code></p>
          <p className="font-body-sm text-xs text-on-surface">Password: <code className="font-bold text-primary">admin</code></p>
        </div>

        <Link
          href="/login"
          className="w-full inline-flex items-center justify-center py-3 px-4 bg-primary text-on-primary font-label-lg rounded-xl hover:bg-primary-container transition-colors font-semibold shadow-sm"
        >
          Return to Admin Login
        </Link>
      </div>
    </div>
  );
}
