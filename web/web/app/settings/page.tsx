"use client";

import React, { useEffect, useState } from "react";
import { IconSettings, IconDeviceFloppy } from "@tabler/icons-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api/client";
import { Business } from "@/lib/api/types";
import { PageHeader } from "@/app/components/page-header";

export default function SettingsPage() {
  const { activeBusiness, refresh } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [cancellationNoticeHours, setCancellationNoticeHours] = useState(2);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (activeBusiness) {
      setName(activeBusiness.name);
      setDescription(activeBusiness.description || "");
      setTimezone(activeBusiness.timezone || "Asia/Kolkata");
      setCancellationPolicy(activeBusiness.cancellationPolicy || "");
      setCancellationNoticeHours(activeBusiness.cancellationNoticeHours || 2);
    }
  }, [activeBusiness]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;
    setMessage(null);
    setSaving(true);

    try {
      await apiRequest<{ business: Business }>(`/businesses/${activeBusiness.id}`, {
        method: "PATCH",
        body: {
          name,
          description,
          timezone,
          cancellationPolicy,
          cancellationNoticeHours: Number(cancellationNoticeHours),
        },
      });
      await refresh();
      setMessage({ type: "success", text: "Business profile updated successfully." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update settings";
      setMessage({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Settings"
        description="Configure your business profile, operating timezone, and cancellation rules."
      />

      {message && (
        <div
          className={`mb-6 rounded-xl p-3.5 text-xs border ${
            message.type === "success"
              ? "bg-[var(--success)]/10 border-[var(--success)]/20 text-[var(--success)]"
              : "bg-[var(--danger)]/10 border-[var(--danger)]/20 text-[var(--danger)]"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 max-w-2xl">
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">Business Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell clients and the AI assistant about your business..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">Timezone (IANA)</label>
              <input
                type="text"
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm text-[var(--foreground)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
                Notice for Cancellation (Hours)
              </label>
              <input
                type="number"
                required
                min={0}
                max={168}
                value={cancellationNoticeHours}
                onChange={(e) => setCancellationNoticeHours(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
              Cancellation Policy Statement
            </label>
            <textarea
              rows={2}
              value={cancellationPolicy}
              onChange={(e) => setCancellationPolicy(e.target.value)}
              placeholder="e.g., Appointments cancelled under 2 hours in advance are non-refundable."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50 transition"
            >
              <IconDeviceFloppy className="size-4" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
