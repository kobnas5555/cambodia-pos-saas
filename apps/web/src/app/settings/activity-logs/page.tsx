'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SettingsNav } from '@/components/SettingsNav';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import {
  apiRequest,
  ApiClientError,
  type ActivityLogEntry,
  type ActivityLogStats,
} from '@/lib/api';

const MODULE_OPTIONS = [
  { value: '', label: 'All Modules' },
  { value: 'sales', label: 'Sales & POS' },
  { value: 'purchasing', label: 'Purchasing' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'products', label: 'Products & Catalog' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'finance', label: 'Finance' },
  { value: 'shifts', label: 'Cashier Shifts' },
  { value: 'branches', label: 'Branches' },
  { value: 'roles', label: 'Roles & Permissions' },
  { value: 'employees', label: 'Employees & Access' },
  { value: 'settings', label: 'Settings' },
  { value: 'tenants', label: 'Tenant Profile' },
  { value: 'auth', label: 'Authentication' },
];

export default function ActivityLogsPage() {
  const { activeTenant } = useAuth();
  const { t } = useI18n();

  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [stats, setStats] = useState<ActivityLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [limit] = useState<number>(50);

  // Modal inspection for oldValues vs newValues
  const [selectedEntry, setSelectedEntry] = useState<ActivityLogEntry | null>(null);
  const [viewRawJson, setViewRawJson] = useState<boolean>(false);

  const fetchLogs = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedModule) params.set('module', selectedModule);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('page', String(currentPage));
      params.set('limit', String(limit));

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const [logsData, statsData] = await Promise.all([
        apiRequest<ActivityLogEntry[]>(`/activity-logs${queryStr}`),
        apiRequest<ActivityLogStats>('/activity-logs/stats').catch(() => null),
      ]);

      setLogs(logsData);
      if (statsData) setStats(statsData);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load activity logs');
    } finally {
      setLoading(false);
    }
  }, [activeTenant, selectedModule, searchTerm, actionFilter, startDate, endDate, currentPage, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Derived metrics fallback if stats API isn't populated
  const computedMetrics = useMemo(() => {
    if (stats) {
      return {
        total: stats.totalLogs,
        users: stats.uniqueUsers,
        statusChanges: stats.statusTransitions,
        topModule: stats.topModules[0]?.module || 'None',
      };
    }
    const distinctUsers = new Set(logs.map((l) => l.user?.id || l.user?.email).filter(Boolean)).size;
    const statusChanges = logs.filter(
      (l) =>
        l.action.includes('status_changed') ||
        l.action.includes('.closed') ||
        l.action.includes('.archived') ||
        l.action.includes('.returned') ||
        l.action.includes('.received') ||
        (l.oldValues && typeof l.oldValues === 'object' && 'status' in l.oldValues),
    ).length;
    return {
      total: logs.length,
      users: distinctUsers,
      statusChanges,
      topModule: logs[0]?.module || 'None',
    };
  }, [stats, logs]);

  const handleExportCsv = () => {
    if (logs.length === 0) return;
    const headers = ['Timestamp', 'Action', 'Module', 'Record Type', 'Record ID', 'User Name', 'User Email', 'Employee Code', 'IP Address'];
    const rows = logs.map((l) => [
      `"${new Date(l.createdAt).toISOString()}"`,
      `"${l.action}"`,
      `"${l.module}"`,
      `"${l.recordType}"`,
      `"${l.recordId || ''}"`,
      `"${l.user?.name || ''}"`,
      `"${l.user?.email || ''}"`,
      `"${l.employee?.employeeCode || ''}"`,
      `"${l.ipAddress || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('status') || action.includes('returned') || action.includes('received') || action.includes('closed')) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    if (action.includes('create') || action.includes('open') || action.includes('completed')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (action.includes('update') || action.includes('publish')) {
      return 'bg-sky-50 text-sky-700 border-sky-200';
    }
    if (action.includes('archive') || action.includes('delete') || action.includes('deactivate')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  const getModuleBadgeColor = (module: string) => {
    switch (module) {
      case 'sales':
        return 'bg-blue-100 text-blue-800';
      case 'purchasing':
        return 'bg-purple-100 text-purple-800';
      case 'inventory':
        return 'bg-amber-100 text-amber-800';
      case 'products':
      case 'suppliers':
        return 'bg-teal-100 text-teal-800';
      case 'finance':
        return 'bg-emerald-100 text-emerald-800';
      case 'shifts':
        return 'bg-cyan-100 text-cyan-800';
      case 'roles':
      case 'employees':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <AppShell>
      <div className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
        <SettingsNav activeKey="activity" />
      </div>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.logs.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{t.logs.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={logs.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t.logs.exportLogs}
            </button>
            <button
              type="button"
              onClick={fetchLogs}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Overview Metric Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.logs.totalLogs}</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{computedMetrics.total}</span>
              <span className="text-xs text-slate-500">recorded</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.logs.uniqueUsers}</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-indigo-600">{computedMetrics.users}</span>
              <span className="text-xs text-slate-500">actors</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.logs.statusTransitions}</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-600">{computedMetrics.statusChanges}</span>
              <span className="text-xs text-slate-500">lifecycle events</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Top Module</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="truncate text-xl font-bold uppercase text-slate-800">{computedMetrics.topModule}</span>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t.common.search}</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t.logs.searchPlaceholder}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t.logs.filterModule}</label>
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
              >
                {MODULE_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          {(searchTerm || selectedModule || actionFilter || startDate || endDate) && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500">Filtered results</span>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedModule('');
                  setActionFilter('');
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Activity Logs Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t.logs.timestamp}</th>
                  <th className="px-4 py-3">{t.logs.user}</th>
                  <th className="px-4 py-3">{t.logs.module}</th>
                  <th className="px-4 py-3">{t.logs.action}</th>
                  <th className="px-4 py-3">{t.logs.record}</th>
                  <th className="px-4 py-3">{t.logs.ipAddress}</th>
                  <th className="px-4 py-3 text-right">{t.logs.details}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      <div className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                        <span>{t.common.loading}</span>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      {t.common.noData}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const hasPayload = Boolean(
                      (log.oldValues && Object.keys(log.oldValues).length > 0) ||
                      (log.newValues && Object.keys(log.newValues).length > 0),
                    );
                    const isStatusTransition =
                      log.action.includes('status') ||
                      log.action.includes('returned') ||
                      log.action.includes('received') ||
                      log.action.includes('closed');

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 font-mono">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 text-xs">
                            {log.user?.name || log.user?.email || 'System'}
                          </div>
                          {log.employee && (
                            <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              <span>{log.employee.employeeCode}</span>
                              {log.employee.position && <span>• {log.employee.position}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${getModuleBadgeColor(
                              log.module,
                            )}`}
                          >
                            {log.module}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono font-medium ${getActionBadgeColor(
                              log.action,
                            )}`}
                          >
                            {isStatusTransition && (
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            )}
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 font-medium">
                          <div>{log.recordType}</div>
                          {log.recordId && (
                            <span className="font-mono text-[10px] text-slate-600" title={log.recordId}>
                              {log.recordId.slice(0, 8)}...
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600">
                          {log.ipAddress || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEntry(log);
                              setViewRawJson(false);
                            }}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold shadow-sm transition-colors ${
                              hasPayload
                                ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            {t.logs.viewDiff}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
            <div>
              {t.logs.showingPage} <span className="font-semibold text-slate-900">{currentPage}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage <= 1 || loading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={logs.length < limit || loading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Inspection / Diff Modal */}
        {selectedEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${getModuleBadgeColor(
                        selectedEntry.module,
                      )}`}
                    >
                      {selectedEntry.module}
                    </span>
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {selectedEntry.action}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Target: {selectedEntry.recordType} ({selectedEntry.recordId || 'N/A'}) • Actor:{' '}
                    {selectedEntry.user?.name || selectedEntry.user?.email || 'System'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEntry(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">
                {/* Meta details */}
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <div>
                    <span className="font-semibold text-slate-700">Timestamp: </span>
                    {new Date(selectedEntry.createdAt).toLocaleString()}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">IP Address: </span>
                    {selectedEntry.ipAddress || '—'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Employee: </span>
                    {selectedEntry.employee ? `${selectedEntry.employee.name} (${selectedEntry.employee.employeeCode})` : '—'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">User Email: </span>
                    {selectedEntry.user?.email || '—'}
                  </div>
                </div>

                {/* Toggle diff / raw json */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Recorded Attributes & State</h3>
                  <button
                    type="button"
                    onClick={() => setViewRawJson(!viewRawJson)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    {viewRawJson ? 'View Table Comparison' : 'View Raw JSON'}
                  </button>
                </div>

                {viewRawJson ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
                    <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
                      <div className="mb-1 font-bold text-red-800">{t.logs.before}</div>
                      <pre className="max-h-60 overflow-auto text-slate-800 whitespace-pre-wrap">
                        {selectedEntry.oldValues ? JSON.stringify(selectedEntry.oldValues, null, 2) : 'null'}
                      </pre>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                      <div className="mb-1 font-bold text-emerald-800">{t.logs.after}</div>
                      <pre className="max-h-60 overflow-auto text-slate-800 whitespace-pre-wrap">
                        {selectedEntry.newValues ? JSON.stringify(selectedEntry.newValues, null, 2) : 'null'}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    {(() => {
                      const oldObj = (selectedEntry.oldValues || {}) as Record<string, unknown>;
                      const newObj = (selectedEntry.newValues || {}) as Record<string, unknown>;
                      const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));

                      if (allKeys.length === 0) {
                        return (
                          <div className="p-6 text-center text-xs text-slate-500">
                            {t.logs.noValues}
                          </div>
                        );
                      }

                      return (
                        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                          <thead className="bg-slate-50 font-semibold uppercase text-slate-500">
                            <tr>
                              <th className="px-3 py-2">Field</th>
                              <th className="px-3 py-2 text-red-700">{t.logs.before}</th>
                              <th className="px-3 py-2 text-emerald-700">{t.logs.after}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {allKeys.map((key) => {
                              const beforeVal = oldObj[key] !== undefined ? JSON.stringify(oldObj[key]) : '—';
                              const afterVal = newObj[key] !== undefined ? JSON.stringify(newObj[key]) : '—';
                              const isChanged = beforeVal !== afterVal;

                              return (
                                <tr key={key} className={isChanged ? 'bg-amber-50/40' : undefined}>
                                  <td className="px-3 py-2 font-sans font-semibold text-slate-700">
                                    {key}
                                  </td>
                                  <td className="px-3 py-2 text-red-600 line-through">
                                    {beforeVal}
                                  </td>
                                  <td className="px-3 py-2 font-bold text-emerald-700">
                                    {afterVal}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-right">
                <button
                  type="button"
                  onClick={() => setSelectedEntry(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                >
                  {t.logs.close}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
