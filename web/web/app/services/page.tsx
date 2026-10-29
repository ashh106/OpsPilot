"use client";

import React, { useEffect, useState, useCallback } from "react";
import { IconScissors, IconPlus, IconCheck, IconX } from "@tabler/icons-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api/client";
import { Service } from "@/lib/api/types";
import { PageHeader } from "@/app/components/page-header";
import { EmptyState } from "@/app/components/empty-state";

export default function ServicesPage() {
  const { activeBusiness } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [price, setPrice] = useState(500);
  const [currency, setCurrency] = useState("INR");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    if (!activeBusiness) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ services: Service[] }>(`/businesses/${activeBusiness.id}/services`);
      setServices(res.services);
    } catch {
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [activeBusiness]);

  useEffect(() => {
    void fetchServices();
  }, [fetchServices]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;
    setError(null);
    setSubmitting(true);

    try {
      await apiRequest(`/businesses/${activeBusiness.id}/services`, {
        method: "POST",
        body: {
          name,
          description,
          durationMinutes: Number(durationMinutes),
          price: Number(price),
          currency,
        },
      });
      await fetchServices();
      setModalOpen(false);
      setName("");
      setDescription("");
      setDurationMinutes(30);
      setPrice(500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create service";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (service: Service) => {
    if (!activeBusiness) return;
    try {
      await apiRequest(`/businesses/${activeBusiness.id}/services/${service.id}`, {
        method: "PATCH",
        body: { active: !service.active },
      });
      await fetchServices();
    } catch {
      // Refresh to keep client in sync
      void fetchServices();
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Services"
        description="Bookable services, required duration, and pricing for this business."
        actions={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 transition"
          >
            <IconPlus className="size-4" />
            Add Service
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="size-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      ) : services.length === 0 ? (
        <EmptyState
          icon={IconScissors}
          title="No services configured"
          description="Add the services customers can book, specifying durations and pricing."
          action={
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)]"
            >
              <IconPlus className="size-4" /> Add your first service
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <div
              key={service.id}
              className={`flex flex-col justify-between rounded-xl border p-5 transition ${
                service.active
                  ? "border-[var(--border)] bg-[var(--surface)]"
                  : "border-[var(--border)] bg-[var(--surface)] opacity-60"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-[var(--foreground)] text-base">{service.name}</h3>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      service.active
                        ? "bg-[var(--success)]/10 text-[var(--success)]"
                        : "bg-[var(--muted)]/10 text-[var(--muted)]"
                    }`}
                  >
                    {service.active ? "Active" : "Inactive"}
                  </span>
                </div>
                {service.description && (
                  <p className="text-xs text-[var(--muted)] mb-4 line-clamp-2">{service.description}</p>
                )}
              </div>

              <div className="border-t border-[var(--border)] pt-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-[var(--accent)] font-semibold">
                    {service.currency} {Number(service.price).toFixed(2)}
                  </span>
                  <span className="text-[var(--muted)] ml-2">({service.durationMinutes} min)</span>
                </div>
                <button
                  onClick={() => void handleToggleActive(service)}
                  title={service.active ? "Deactivate service" : "Activate service"}
                  className="rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-raised)] transition"
                >
                  {service.active ? <IconX className="size-4" /> : <IconCheck className="size-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Service Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">Add New Service</h2>
            <p className="text-xs text-[var(--muted)] mb-4">
              Create a service offering with duration for appointment slot allocation.
            </p>

            {error && (
              <div className="mb-4 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/20 p-3 text-xs text-[var(--danger)]">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Service Name</label>
                <input
                  type="text"
                  required
                  placeholder="Comprehensive Dental Checkup"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="30-minute consultation with oral examination..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    required
                    min={5}
                    step={5}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Price</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={50}
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Currency</label>
                <input
                  type="text"
                  required
                  maxLength={3}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-raised)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
