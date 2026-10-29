"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    router.push("/");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[var(--background)]">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)] font-bold text-lg">
            O
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)]">Sign in to OpsPilot</h1>
            <p className="text-xs text-[var(--muted)]">AI Operations Platform for Appointment Businesses</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 p-3 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@clinic.com"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[var(--foreground)]">Password</label>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-foreground)] hover:opacity-90 transition disabled:opacity-50 mt-2"
          >
            {loading ? "Authenticating..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-[var(--accent)] hover:underline">
            Register your business
          </Link>
        </p>
      </div>
    </div>
  );
}
