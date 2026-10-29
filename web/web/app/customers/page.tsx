"use client";

import React, { useEffect, useState, useCallback } from "react";
import { IconUsers, IconPhone, IconMail, IconCalendarEvent, IconSearch } from "@tabler/icons-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api/client";
import { Customer } from "@/lib/api/types";
import { PageHeader } from "@/app/components/page-header";
import { EmptyState } from "@/app/components/empty-state";

export default function CustomersPage() {
  const { activeBusiness } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchCustomers = useCallback(async () => {
    if (!activeBusiness) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ customers: Customer[] }>(
        `/businesses/${activeBusiness.id}/customers`,
      );
      setCustomers(res.customers);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [activeBusiness]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const filtered = customers.filter((c) => {
    const q = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  return (
    <AppShell>
      <PageHeader
        title="Customers"
        description="Client directory automatically populated from appointments and chat inquiries."
      />

      {/* Search Input */}
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 max-w-md">
        <IconSearch className="size-4 text-[var(--muted)] ml-1" />
        <input
          type="text"
          placeholder="Search by name, phone, or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-transparent text-xs text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] mr-1"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="size-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={IconUsers}
          title="No customer records yet"
          description="Customer records will automatically populate when bookings are scheduled or inquiries are logged."
        />
      ) : filtered.length === 0 ? (
        <p className="text-xs text-[var(--muted)] py-6 italic text-center">
          No clients match &ldquo;{searchTerm}&rdquo;.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((customer) => (
            <div
              key={customer.id}
              className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-[var(--accent)]/50"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-[var(--foreground)] text-base">{customer.name}</h3>
                  <span className="flex items-center gap-1 rounded bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] font-mono text-[var(--accent)]">
                    <IconCalendarEvent className="size-3" />
                    {customer._count?.appointments ?? 0}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-[var(--muted)]">
                  {customer.phone ? (
                    <div className="flex items-center gap-2">
                      <IconPhone className="size-3.5 text-[var(--muted)]" />
                      <span>{customer.phone}</span>
                    </div>
                  ) : null}

                  {customer.email ? (
                    <div className="flex items-center gap-2">
                      <IconMail className="size-3.5 text-[var(--muted)]" />
                      <span className="truncate">{customer.email}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-[var(--border)] pt-3 mt-4 text-[11px] text-[var(--muted)] flex items-center justify-between">
                <span>Client since</span>
                <span className="font-mono">
                  {new Date(customer.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
