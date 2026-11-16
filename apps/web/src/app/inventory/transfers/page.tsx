'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../../components/AppShell';
import { api } from '../../../lib/api';
import { useI18n } from '../../../contexts/I18nContext';

interface TransferItem {
  id: string;
  productId: string;
  quantity: string;
  notes?: string | null;
  product?: {
    id: string;
    name: string;
    sku: string;
    barcode?: string | null;
  } | null;
}

interface StockTransfer {
  id: string;
  transferNumber: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  notes?: string | null;
  transferDate: string;
  receivedDate?: string | null;
  fromBranch?: { id: string; name: string; branchCode: string } | null;
  toBranch?: { id: string; name: string; branchCode: string } | null;
  items: TransferItem[];
}

export default function StockTransfersPage() {
  const { t } = useI18n();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [transferItems, setTransferItems] = useState<Array<{ productId: string; productName: string; quantity: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [transfersRes, branchesRes, productsRes] = await Promise.all([
        api.get<any>('/transfers', { params: statusFilter !== 'ALL' ? { status: statusFilter } : {} }).catch(() => ({ data: [] })),
        api.get<any>('/branches').catch(() => ({ data: [] })),
        api.get<any>('/products').catch(() => ({ data: [] })),
      ]);

      setTransfers(transfersRes.data ?? []);
      setBranches(branchesRes.data ?? []);
      setProducts(productsRes.data ?? []);

      if (branchesRes.data && branchesRes.data.length >= 2) {
        setFromBranchId(branchesRes.data[0].id);
        setToBranchId(branchesRes.data[1].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleAddItem = () => {
    if (!selectedProductId || Number(quantity) <= 0) return;
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    setTransferItems((prev) => [
      ...prev,
      { productId: prod.id, productName: prod.name, quantity },
    ]);
    setSelectedProductId('');
    setQuantity('1');
  };

  const handleRemoveItem = (index: number) => {
    setTransferItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferItems.length === 0 || fromBranchId === toBranchId) return;

    setSubmitting(true);
    setActionError('');
    try {
      await api.post('/transfers', {
        fromBranchId,
        toBranchId,
        notes: notes || undefined,
        items: transferItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      });

      setIsModalOpen(false);
      setTransferItems([]);
      setNotes('');
      loadData();
    } catch (err: any) {
      setActionError(err.response?.data?.message || err.message || 'Failed to create transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (id: string) => {
    try {
      await api.post(`/transfers/${id}/send`, {});
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to dispatch transfer');
    }
  };

  const handleReceive = async (id: string) => {
    try {
      await api.post(`/transfers/${id}/receive`, {});
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to receive transfer');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this transfer?')) return;
    try {
      await api.post(`/transfers/${id}/cancel`, {});
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to cancel transfer');
    }
  };

  const getStatusBadge = (status: StockTransfer['status']) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending Dispatch</span>;
      case 'IN_TRANSIT':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">In Transit</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">Completed</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">Cancelled</span>;
      default:
        return null;
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/inventory" className="text-xs text-slate-400 hover:text-slate-200">
                ← Back to Inventory
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {t.transfers?.title ?? 'Branch Stock Transfers'}
            </h1>
            <p className="text-sm text-slate-400">
              {t.transfers?.subtitle ?? 'Transfer inventory between physical store locations with transit tracking.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-sm transition-all"
            >
              + {t.transfers?.newTransfer ?? 'New Transfer'}
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {['ALL', 'PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === st
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Transfers Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading transfers...</div>
          ) : transfers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <div className="text-3xl">📦</div>
              <div className="font-semibold text-white">No stock transfers found</div>
              <div className="text-xs">Create a new transfer to move stock between branches.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-400 uppercase text-xs border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Transfer #</th>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {transfers.map((tr) => (
                    <tr key={tr.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-white">
                        {tr.transferNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-200">{tr.fromBranch?.name ?? 'Branch A'}</span>
                          <span className="text-slate-500">→</span>
                          <span className="font-medium text-blue-400">{tr.toBranch?.name ?? 'Branch B'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {tr.items.length} product(s) (
                        {tr.items.reduce((acc, it) => acc + Number(it.quantity), 0)} units)
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(tr.status)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {new Date(tr.transferDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {tr.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSend(tr.id)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
                            >
                              Dispatch
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancel(tr.id)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-red-500/20 text-red-400 rounded text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {tr.status === 'IN_TRANSIT' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleReceive(tr.id)}
                              className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-semibold"
                            >
                              Receive
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancel(tr.id)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-red-500/20 text-red-400 rounded text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {tr.status === 'COMPLETED' && (
                          <span className="text-xs text-slate-500">Received</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create Transfer Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="font-bold text-lg text-white">Create Stock Transfer</h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {actionError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                  {actionError}
                </div>
              )}

              <form onSubmit={handleCreateTransfer} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                      From Branch
                    </label>
                    <select
                      value={fromBranchId}
                      onChange={(e) => setFromBranchId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm"
                      required
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                      To Branch
                    </label>
                    <select
                      value={toBranchId}
                      onChange={(e) => setToBranchId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm"
                      required
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Add product section */}
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 space-y-2">
                  <div className="text-xs font-semibold text-slate-300">Add Products to Transfer</div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-8">
                      <select
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-750 rounded text-xs text-white"
                      >
                        <option value="">Select product...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-750 rounded text-xs text-white text-center"
                      />
                    </div>

                    <div className="col-span-2">
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Transfer Items list */}
                  {transferItems.length > 0 && (
                    <div className="pt-2 space-y-1">
                      {transferItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs p-1.5 bg-slate-900 rounded border border-slate-800 text-slate-300"
                        >
                          <span>{item.productName}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-white">x{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                    Notes / Driver / Vehicle details
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Courier: Virak Buntham / Waybill: VB-90231"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || transferItems.length === 0}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm"
                  >
                    {submitting ? 'Creating...' : 'Create Transfer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

