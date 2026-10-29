"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  IconPackage,
  IconPlus,
  IconAlertTriangle,
  IconCurrencyRupee,
  IconSearch,
  IconHistory,
  IconAdjustmentsHorizontal,
  IconPencil,
  IconX,
} from "@tabler/icons-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api/client";
import { Product, InventorySummary, InventoryAudit } from "@/lib/api/types";
import { PageHeader } from "@/app/components/page-header";
import { EmptyState } from "@/app/components/empty-state";

export default function ProductsPage() {
  const { activeBusiness } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [adjustModalProduct, setAdjustModalProduct] = useState<Product | null>(null);
  const [priceModalProduct, setPriceModalProduct] = useState<Product | null>(null);
  const [historyModalProduct, setHistoryModalProduct] = useState<Product | null>(null);
  const [audits, setAudits] = useState<InventoryAudit[]>([]);
  const [auditsLoading, setAuditsLoading] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState(50);
  const [currency, setCurrency] = useState("INR");
  const [initialStock, setInitialStock] = useState(10);
  const [unit, setUnit] = useState("pcs");
  const [quantityDelta, setQuantityDelta] = useState(0);
  const [newPrice, setNewPrice] = useState(0);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!activeBusiness) return;
    setLoading(true);
    try {
      const searchParam = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const [prodRes, sumRes] = await Promise.all([
        apiRequest<{ data: Product[] }>(`/businesses/${activeBusiness.id}/products${searchParam}`),
        apiRequest<{ data: InventorySummary }>(`/businesses/${activeBusiness.id}/products/summary`),
      ]);
      setProducts(prodRes.data || []);
      setSummary(sumRes.data || null);
    } catch {
      setProducts([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [activeBusiness, search]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;
    setError(null);
    setSubmitting(true);

    try {
      await apiRequest(`/businesses/${activeBusiness.id}/products`, {
        method: "POST",
        body: {
          name,
          description,
          sku: sku.trim() || undefined,
          price: Number(price),
          currency,
          initialStock: Number(initialStock),
          unit,
        },
      });
      await fetchProducts();
      setCreateModalOpen(false);
      setName("");
      setDescription("");
      setSku("");
      setPrice(50);
      setInitialStock(10);
      setUnit("pcs");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !adjustModalProduct) return;
    setError(null);
    setSubmitting(true);

    try {
      await apiRequest(
        `/businesses/${activeBusiness.id}/products/${adjustModalProduct.id}/stock`,
        {
          method: "POST",
          body: {
            quantityDelta: Number(quantityDelta),
            reason: reason.trim() || undefined,
          },
        },
      );
      await fetchProducts();
      setAdjustModalProduct(null);
      setQuantityDelta(0);
      setReason("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !priceModalProduct) return;
    setError(null);
    setSubmitting(true);

    try {
      await apiRequest(
        `/businesses/${activeBusiness.id}/products/${priceModalProduct.id}/price`,
        {
          method: "PATCH",
          body: {
            newPrice: Number(newPrice),
            reason: reason.trim() || undefined,
          },
        },
      );
      await fetchProducts();
      setPriceModalProduct(null);
      setNewPrice(0);
      setReason("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update price");
    } finally {
      setSubmitting(false);
    }
  };

  const openAuditHistory = async (prod: Product) => {
    if (!activeBusiness) return;
    setHistoryModalProduct(prod);
    setAuditsLoading(true);
    try {
      const res = await apiRequest<{ data: InventoryAudit[] }>(
        `/businesses/${activeBusiness.id}/products/${prod.id}/audits`,
      );
      setAudits(res.data || []);
    } catch {
      setAudits([]);
    } finally {
      setAuditsLoading(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Inventory & Products"
        description="Manage your products, track real-time stock quantities, and audit price updates."
        actions={
          <button
            onClick={() => {
              setError(null);
              setCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 transition cursor-pointer"
          >
            <IconPlus className="size-4" />
            Add Product
          </button>
        }
      />

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Total Products</span>
              <IconPackage className="size-4 text-[var(--muted-foreground)]" />
            </div>
            <div className="mt-2 text-2xl font-bold">{summary.totalProducts}</div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{summary.activeProducts} active items</p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Low Stock Alert</span>
              <IconAlertTriangle className="size-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-600">{summary.lowStockProducts}</div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{summary.outOfStockProducts} out of stock</p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Total Stock Units</span>
              <IconAdjustmentsHorizontal className="size-4 text-[var(--muted-foreground)]" />
            </div>
            <div className="mt-2 text-2xl font-bold">{summary.totalStockCount}</div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Across all active items</p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Inventory Value</span>
              <IconCurrencyRupee className="size-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600">
              ₹{summary.totalInventoryValue.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Total valuation</p>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or SKU..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      {/* Products Table or Empty State */}
      {loading ? (
        <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">Loading products...</div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={IconPackage}
          title="No products yet"
          description="Add items to your inventory to start tracking stock quantities and managing prices."
          action={
            <button
              onClick={() => {
                setError(null);
                setCreateModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)]"
            >
              <IconPlus className="size-4" />
              Add Product
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[var(--muted-foreground)] uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Current Stock</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {products.map((p) => {
                  const isLow = p.stockQuantity < 5;
                  const isOut = p.stockQuantity === 0;

                  return (
                    <tr key={p.id} className="hover:bg-[var(--muted)]/30 transition">
                      <td className="px-4 py-3 font-medium">
                        <div>{p.name}</div>
                        {p.description && (
                          <div className="text-[10px] text-[var(--muted-foreground)] truncate max-w-xs">
                            {p.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--muted-foreground)]">
                        {p.sku || "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        ₹{Number(p.price).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            isOut
                              ? "bg-red-500/10 text-red-600"
                              : isLow
                              ? "bg-amber-500/10 text-amber-600"
                              : "bg-emerald-500/10 text-emerald-600"
                          }`}
                        >
                          {p.stockQuantity} {p.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setError(null);
                              setAdjustModalProduct(p);
                              setQuantityDelta(0);
                            }}
                            title="Adjust Stock"
                            className="rounded p-1.5 hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition cursor-pointer"
                          >
                            <IconAdjustmentsHorizontal className="size-4" />
                          </button>
                          <button
                            onClick={() => {
                              setError(null);
                              setPriceModalProduct(p);
                              setNewPrice(Number(p.price));
                            }}
                            title="Update Price"
                            className="rounded p-1.5 hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition cursor-pointer"
                          >
                            <IconPencil className="size-4" />
                          </button>
                          <button
                            onClick={() => openAuditHistory(p)}
                            title="Audit History"
                            className="rounded p-1.5 hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition cursor-pointer"
                          >
                            <IconHistory className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Product Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold">Add New Product</h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <IconX className="size-4" />
              </button>
            </div>
            <form onSubmit={handleCreateProduct} className="mt-4 space-y-3">
              {error && <div className="text-xs text-red-500">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)]">Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Basmati Rice 5kg"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)]">Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)]">SKU (Optional)</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="e.g. RICE-5KG"
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)]">Initial Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={initialStock}
                    onChange={(e) => setInitialStock(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)]">Unit</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="pcs, kg, litre, bag"
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)]">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--muted)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Saving..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold">Adjust Stock: {adjustModalProduct.name}</h3>
              <button
                onClick={() => setAdjustModalProduct(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <IconX className="size-4" />
              </button>
            </div>
            <form onSubmit={handleAdjustStock} className="mt-4 space-y-3">
              {error && <div className="text-xs text-red-500">{error}</div>}
              <div className="rounded-lg bg-[var(--muted)]/40 p-3 text-xs">
                <div>Current Stock: <span className="font-semibold">{adjustModalProduct.stockQuantity} {adjustModalProduct.unit}</span></div>
                <div>New Stock: <span className="font-semibold">{adjustModalProduct.stockQuantity + Number(quantityDelta)} {adjustModalProduct.unit}</span></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                  Quantity Delta (+ to restock, - to deduct) *
                </label>
                <input
                  type="number"
                  required
                  value={quantityDelta}
                  onChange={(e) => setQuantityDelta(Number(e.target.value))}
                  placeholder="e.g. 10 or -5"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)]">Reason</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Wholesale delivery, Customer purchase"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setAdjustModalProduct(null)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--muted)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || Number(quantityDelta) === 0}
                  className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Updating..." : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Price Modal */}
      {priceModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold">Update Price: {priceModalProduct.name}</h3>
              <button
                onClick={() => setPriceModalProduct(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <IconX className="size-4" />
              </button>
            </div>
            <form onSubmit={handleUpdatePrice} className="mt-4 space-y-3">
              {error && <div className="text-xs text-red-500">{error}</div>}
              <div className="text-xs text-[var(--muted-foreground)]">
                Current Price: <span className="font-semibold text-[var(--foreground)]">₹{Number(priceModalProduct.price).toFixed(2)}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)]">New Price (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={newPrice}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)]">Reason</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Seasonal price change"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setPriceModalProduct(null)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--muted)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Updating..." : "Update Price"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit History Modal */}
      {historyModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-semibold">Audit History</h3>
                <p className="text-[11px] text-[var(--muted-foreground)]">{historyModalProduct.name}</p>
              </div>
              <button
                onClick={() => setHistoryModalProduct(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <IconX className="size-4" />
              </button>
            </div>
            <div className="mt-4 max-h-80 overflow-y-auto space-y-2">
              {auditsLoading ? (
                <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">Loading audit records...</div>
              ) : audits.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">No audit history found.</div>
              ) : (
                audits.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--muted)]">
                        {a.changeType}
                      </span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {new Date(a.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                      {a.quantityDelta !== 0 && (
                        <div>
                          Quantity:{" "}
                          <span className={a.quantityDelta > 0 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
                            {a.quantityDelta > 0 ? `+${a.quantityDelta}` : a.quantityDelta}
                          </span>{" "}
                          ({a.previousQuantity} → {a.newQuantity})
                        </div>
                      )}
                      {a.newPrice !== null && a.newPrice !== undefined && (
                        <div>
                          Price: ₹{Number(a.previousPrice || 0).toFixed(2)} →{" "}
                          <span className="font-semibold text-emerald-600">₹{Number(a.newPrice).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    {a.reason && (
                      <div className="mt-1 text-[10px] text-[var(--muted-foreground)] italic">
                        &quot;{a.reason}&quot;
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
