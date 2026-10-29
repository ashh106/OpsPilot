"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCalendarEvent,
  IconClock,
  IconScissors,
  IconUsers,
  IconMessages,
  IconBook2,
  IconClipboardCheck,
  IconActivity,
  IconSettings,
  IconLayoutDashboard,
  IconLogout,
  IconPlus,
  IconMenu2,
  IconX,
  IconBuildingStore,
  IconPackage,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api/client";
import { Business } from "@/lib/api/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Business",
    items: [
      { href: "/", label: "Overview", icon: IconLayoutDashboard },
      { href: "/appointments", label: "Appointments", icon: IconCalendarEvent },
      { href: "/services", label: "Services", icon: IconScissors },
      { href: "/products", label: "Inventory", icon: IconPackage },
      { href: "/working-hours", label: "Working hours", icon: IconClock },
      { href: "/customers", label: "Customers", icon: IconUsers },
    ],
  },
  {
    label: "AI Assistant",
    items: [
      { href: "/conversations", label: "Conversations", icon: IconMessages, badge: "M3" },
      { href: "/knowledge-base", label: "Knowledge base", icon: IconBook2, badge: "M6" },
      { href: "/approvals", label: "Approvals", icon: IconClipboardCheck, badge: "M3" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/activity", label: "Activity logs", icon: IconActivity, badge: "M4" },
      { href: "/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, businesses, activeBusiness, setActiveBusiness, logout, refresh } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Modal form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ business: Business }>("/businesses", {
        method: "POST",
        body: { name, slug, timezone },
      });
      await refresh();
      setActiveBusiness(res.business);
      setShowCreateModal(false);
      setName("");
      setSlug("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create business";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const navContent = (
    <div className="flex h-full flex-col justify-between p-4 bg-[var(--surface)] text-[var(--foreground)]">
      <div>
        <div className="flex items-center gap-2.5 px-3 py-3 border-b border-[var(--border)] mb-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] font-bold text-base">
            O
          </div>
          <div>
            <span className="text-[15px] font-semibold tracking-tight block">OpsPilot</span>
            <span className="text-xs text-[var(--muted)]">Business Ops Agent</span>
          </div>
        </div>

        {/* Business Selector */}
        <div className="px-2 mb-6">
          <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)] block mb-1">
            Active Business
          </label>
          <div className="flex items-center gap-1.5">
            <select
              value={activeBusiness?.id ?? ""}
              onChange={(e) => {
                const found = businesses.find((b) => b.id === e.target.value);
                if (found) setActiveBusiness(found);
              }}
              className="w-full text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2 text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.slug})
                </option>
              ))}
              {businesses.length === 0 && <option value="">No businesses yet</option>}
            </select>
            <button
              onClick={() => setShowCreateModal(true)}
              title="Add Business"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--accent)] hover:bg-[var(--border)] transition"
            >
              <IconPlus className="size-4" />
            </button>
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="flex flex-col gap-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="flex flex-col gap-1">
              <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
                {section.label}
              </p>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? "bg-[var(--surface-raised)] text-[var(--accent)] font-medium border-l-2 border-[var(--accent)]"
                        : "text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="rounded bg-[var(--border)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted)]">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* User Card & Logout */}
      <div className="border-t border-[var(--border)] pt-4 px-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-[var(--foreground)]">{user?.name}</p>
            <p className="truncate text-[11px] text-[var(--muted)]">{user?.email}</p>
          </div>
          <button
            onClick={() => void logout()}
            title="Log out"
            className="flex size-8 items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--surface-raised)] transition"
          >
            <IconLogout className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 border-r border-[var(--border)] z-20">
        {navContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 max-w-xs flex-1 border-r border-[var(--border)] shadow-xl z-50">
            {navContent}
          </div>
        </div>
      )}

      {/* Main Layout Area */}
      <div className="flex flex-1 flex-col md:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-sm px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex size-8 items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {mobileOpen ? <IconX className="size-5" /> : <IconMenu2 className="size-5" />}
            </button>
            <span className="text-sm font-medium text-[var(--foreground)] flex items-center gap-2">
              <IconBuildingStore className="size-4 text-[var(--accent)]" />
              {activeBusiness ? activeBusiness.name : "Select or create business"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {activeBusiness && (
              <span className="text-xs text-[var(--muted)] hidden sm:inline">
                Timezone: <span className="font-mono text-[var(--foreground)]">{activeBusiness.timezone}</span>
              </span>
            )}
          </div>
        </header>

        {/* Content View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">{children}</main>
      </div>

      {/* Create Business Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">Create New Business</h2>
            <p className="text-xs text-[var(--muted)] mb-4">
              Add a new business entity to manage services, schedules, and AI bookings.
            </p>

            {error && (
              <div className="mb-4 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/20 p-3 text-xs text-[var(--danger)]">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateBusiness} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Business Name</label>
                <input
                  type="text"
                  required
                  placeholder="Aura Wellness Clinic"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) {
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-+|-+$/g, ""),
                      );
                    }
                  }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  URL Slug (lowercase letters, numbers, hyphens)
                </label>
                <input
                  type="text"
                  required
                  placeholder="aura-wellness"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Timezone</label>
                <input
                  type="text"
                  required
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-raised)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create Business"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
