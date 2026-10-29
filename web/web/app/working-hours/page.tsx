"use client";

import React, { useEffect, useState, useCallback } from "react";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api/client";
import { BusinessHours } from "@/lib/api/types";
import { PageHeader } from "@/app/components/page-header";

const DAYS = [
  { index: 0, label: "Sunday" },
  { index: 1, label: "Monday" },
  { index: 2, label: "Tuesday" },
  { index: 3, label: "Wednesday" },
  { index: 4, label: "Thursday" },
  { index: 5, label: "Friday" },
  { index: 6, label: "Saturday" },
];

interface DayState {
  enabled: boolean;
  openTime: string;
  closeTime: string;
}

const DEFAULT_SCHEDULE: Record<number, DayState> = {
  0: { enabled: false, openTime: "09:00", closeTime: "17:00" },
  1: { enabled: true, openTime: "09:00", closeTime: "18:00" },
  2: { enabled: true, openTime: "09:00", closeTime: "18:00" },
  3: { enabled: true, openTime: "09:00", closeTime: "18:00" },
  4: { enabled: true, openTime: "09:00", closeTime: "18:00" },
  5: { enabled: true, openTime: "09:00", closeTime: "18:00" },
  6: { enabled: false, openTime: "10:00", closeTime: "15:00" },
};

export default function WorkingHoursPage() {
  const { activeBusiness } = useAuth();
  const [schedule, setSchedule] = useState<Record<number, DayState>>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchHours = useCallback(async () => {
    if (!activeBusiness) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ hours: BusinessHours[] }>(`/businesses/${activeBusiness.id}/hours`);
      const updated: Record<number, DayState> = { ...DEFAULT_SCHEDULE };
      DAYS.forEach((d) => {
        const found = res.hours.find((h) => h.dayOfWeek === d.index);
        if (found) {
          updated[d.index] = { enabled: true, openTime: found.openTime, closeTime: found.closeTime };
        } else {
          updated[d.index] = { enabled: false, openTime: "09:00", closeTime: "17:00" };
        }
      });
      setSchedule(updated);
    } catch {
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }, [activeBusiness]);

  useEffect(() => {
    void fetchHours();
  }, [fetchHours]);

  const handleSave = async () => {
    if (!activeBusiness) return;
    setMessage(null);
    setSaving(true);

    try {
      const payload: { dayOfWeek: number; openTime: string; closeTime: string }[] = [];

      for (const day of DAYS) {
        const item = schedule[day.index] ?? { enabled: false, openTime: "09:00", closeTime: "17:00" };
        if (item.enabled) {
          if (item.openTime >= item.closeTime) {
            throw new Error(`${day.label}: Opening time must be earlier than closing time.`);
          }
          payload.push({
            dayOfWeek: day.index,
            openTime: item.openTime,
            closeTime: item.closeTime,
          });
        }
      }

      await apiRequest(`/businesses/${activeBusiness.id}/hours`, {
        method: "PUT",
        body: payload,
      });

      setMessage({ type: "success", text: "Working hours updated successfully." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update working hours";
      setMessage({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Working Hours"
        description={`Set open intervals in the business timezone (${activeBusiness?.timezone ?? "UTC"}).`}
        actions={
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50 transition"
          >
            <IconDeviceFloppy className="size-4" />
            {saving ? "Saving..." : "Save Schedule"}
          </button>
        }
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

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="size-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {DAYS.map((day) => {
            const current = schedule[day.index] ?? { enabled: false, openTime: "09:00", closeTime: "17:00" };
            return (
              <div
                key={day.index}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`day-${day.index}`}
                    checked={current.enabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setSchedule((prev) => ({
                        ...prev,
                        [day.index]: { ...current, enabled },
                      }));
                    }}
                    className="size-4 rounded accent-[var(--accent)]"
                  />
                  <label htmlFor={`day-${day.index}`} className="text-sm font-medium text-[var(--foreground)] w-28">
                    {day.label}
                  </label>
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                      current.enabled
                        ? "bg-[var(--success)]/10 text-[var(--success)]"
                        : "bg-[var(--surface-raised)] text-[var(--muted)]"
                    }`}
                  >
                    {current.enabled ? "Open" : "Closed"}
                  </span>
                </div>

                {current.enabled && (
                  <div className="flex items-center gap-2 text-xs">
                    <input
                      type="time"
                      value={current.openTime}
                      onChange={(e) => {
                        const openTime = e.target.value;
                        setSchedule((prev) => ({
                          ...prev,
                          [day.index]: { ...current, openTime },
                        }));
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs text-[var(--foreground)] font-mono"
                    />
                    <span className="text-[var(--muted)]">to</span>
                    <input
                      type="time"
                      value={current.closeTime}
                      onChange={(e) => {
                        const closeTime = e.target.value;
                        setSchedule((prev) => ({
                          ...prev,
                          [day.index]: { ...current, closeTime },
                        }));
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs text-[var(--foreground)] font-mono"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
