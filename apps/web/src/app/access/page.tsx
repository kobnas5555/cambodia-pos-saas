'use client';

import {
  Award,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  Key,
  LayoutGrid,
  List,
  Lock,
  Mail,
  Plus,
  Search,
  Shield,
  Store,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

interface EmployeeRow {
  id: string;
  employeeCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  hireDate?: string | null;
  status: string;
  hasLoginAccount: boolean;
  createdAt?: string;
  branches: Array<{ id: string; name: string; branchCode: string }>;
  roles: Array<{ id: string; name: string }>;
}

interface RoleRow {
  id: string;
  tenantId?: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface PermissionRow {
  id: string;
  code: string;
  module: string;
  description: string | null;
}

interface InvitationRow {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  role: { name: string };
}

type AccessTab = 'employees' | 'roles' | 'permissions' | 'branchAccess' | 'invitations';

export default function AccessPage() {
  const { activeTenant, hasPermission } = useAuth();
  const { t } = useI18n();

  const canManageRoles = hasPermission('roles.manage');
  const canCreateEmployees = hasPermission('employees.create');
  const canUpdateEmployees = hasPermission('employees.update');

  const [tab, setTab] = useState<AccessTab>('employees');
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filters for Employees tab
  const [empSearch, setEmpSearch] = useState('');
  const [empStatusFilter, setEmpStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [empBranchFilter, setEmpBranchFilter] = useState<string>('ALL');
  const [empPage, setEmpPage] = useState<number>(1);
  const [empPageSize, setEmpPageSize] = useState<number>(10);

  // Filters for Roles tab
  const [roleSearch, setRoleSearch] = useState('');
  const [roleTypeFilter, setRoleTypeFilter] = useState<'ALL' | 'SYSTEM' | 'CUSTOM'>('ALL');
  const [rolePage, setRolePage] = useState<number>(1);
  const [rolePageSize, setRolePageSize] = useState<number>(10);
  const [roleViewMode, setRoleViewMode] = useState<'table' | 'cards'>('table');

  // Filters for Permissions tab
  const [permSearch, setPermSearch] = useState('');
  const [permModuleFilter, setPermModuleFilter] = useState<string>('ALL');

  // Branch Access updating state
  const [updatingBranchEmpId, setUpdatingBranchEmpId] = useState<string | null>(null);

  // Employee creation modal
  const [empModal, setEmpModal] = useState(false);
  const [empCode, setEmpCode] = useState('');
  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empPos, setEmpPos] = useState('Cashier');
  const [empHireDate, setEmpHireDate] = useState('');
  const [empRoleId, setEmpRoleId] = useState('');
  const [empBranches, setEmpBranches] = useState<string[]>([]);
  const [createAccount, setCreateAccount] = useState(true);
  const [empPassword, setEmpPassword] = useState('');

  // Role modal (create or edit)
  const [roleModal, setRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  // Edit Employee modal (assign roles & branches)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRow | null>(null);
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpPos, setEditEmpPos] = useState('');
  const [editEmpPhone, setEditEmpPhone] = useState('');
  const [editEmpEmail, setEditEmpEmail] = useState('');
  const [editEmpHireDate, setEditEmpHireDate] = useState('');
  const [editEmpRoles, setEditEmpRoles] = useState<string[]>([]);
  const [editEmpBranches, setEditEmpBranches] = useState<string[]>([]);

  // Invite modal
  const [invModal, setInvModal] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRoleId, setInvRoleId] = useState('');
  const [devInviteToken, setDevInviteToken] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const [emps, rls, perms, invs] = await Promise.all([
        apiRequest<EmployeeRow[]>('/access/employees'),
        apiRequest<RoleRow[]>('/access/roles'),
        apiRequest<PermissionRow[]>('/access/permissions'),
        apiRequest<InvitationRow[]>('/access/invitations'),
      ]);
      setEmployees(emps);
      setRoles(rls);
      setPermissions(perms);
      setInvitations(invs);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load access records');
    } finally {
      setLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Derived filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (empStatusFilter !== 'ALL' && e.status !== empStatusFilter) return false;
      if (empBranchFilter !== 'ALL' && !e.branches.some((b) => b.id === empBranchFilter))
        return false;
      if (empSearch.trim()) {
        const q = empSearch.trim().toLowerCase();
        const matches =
          e.name.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q) ||
          (e.email && e.email.toLowerCase().includes(q)) ||
          (e.phone && e.phone.includes(q)) ||
          (e.position && e.position.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [employees, empStatusFilter, empBranchFilter, empSearch]);

  useEffect(() => {
    setEmpPage(1);
  }, [empSearch, empStatusFilter, empBranchFilter]);

  const paginatedEmployees = useMemo(() => {
    const start = (empPage - 1) * empPageSize;
    return filteredEmployees.slice(start, start + empPageSize);
  }, [filteredEmployees, empPage, empPageSize]);

  // Derived filtered roles
  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      if (roleTypeFilter === 'SYSTEM' && !r.isSystem) return false;
      if (roleTypeFilter === 'CUSTOM' && r.isSystem) return false;
      if (roleSearch.trim()) {
        const q = roleSearch.trim().toLowerCase();
        const matches =
          r.name.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q)) ||
          r.permissions.some((p) => p.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [roles, roleTypeFilter, roleSearch]);

  useEffect(() => {
    setRolePage(1);
  }, [roleSearch, roleTypeFilter]);

  const paginatedRoles = useMemo(() => {
    const start = (rolePage - 1) * rolePageSize;
    return filteredRoles.slice(start, start + rolePageSize);
  }, [filteredRoles, rolePage, rolePageSize]);

  // Derived filtered permissions
  const filteredPermissions = useMemo(() => {
    return permissions.filter((p) => {
      if (permModuleFilter !== 'ALL' && p.module !== permModuleFilter) return false;
      if (permSearch.trim()) {
        const q = permSearch.trim().toLowerCase();
        const matches =
          p.code.toLowerCase().includes(q) ||
          p.module.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [permissions, permModuleFilter, permSearch]);

  // Permission modules list
  const permissionModules = useMemo(() => {
    const set = new Set<string>();
    for (const p of permissions) {
      if (p.module) set.add(p.module);
    }
    return Array.from(set).sort();
  }, [permissions]);

  // Handle Employee Creation
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/access/employees', {
        method: 'POST',
        body: JSON.stringify({
          employeeCode: empCode,
          name: empName,
          email: empEmail || null,
          phone: empPhone || null,
          position: empPos || null,
          hireDate: empHireDate || null,
          roleId: empRoleId || null,
          branchIds: empBranches,
          createUserAccount: createAccount,
          password: createAccount ? empPassword : undefined,
        }),
      });
      setEmpModal(false);
      setFeedback('Employee created successfully.');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create employee');
    }
  };

  // Open Edit Employee Modal
  const openEditEmployeeModal = (emp: EmployeeRow) => {
    setEditingEmployee(emp);
    setEditEmpName(emp.name);
    setEditEmpPos(emp.position ?? '');
    setEditEmpPhone(emp.phone ?? '');
    setEditEmpEmail(emp.email ?? '');
    setEditEmpHireDate(emp.hireDate ? emp.hireDate.slice(0, 10) : '');
    setEditEmpRoles(emp.roles.map((r) => r.id));
    setEditEmpBranches(emp.branches.map((b) => b.id));
    setError(null);
  };

  // Handle Employee Update
  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setError(null);
    try {
      await apiRequest(`/access/employees/${editingEmployee.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editEmpName,
          position: editEmpPos || null,
          phone: editEmpPhone || null,
          email: editEmpEmail || null,
          hireDate: editEmpHireDate || null,
          branchIds: editEmpBranches,
          ...(editingEmployee.hasLoginAccount ? { roleIds: editEmpRoles } : {}),
        }),
      });
      setEditingEmployee(null);
      setFeedback('Employee profile, roles, and branch access updated.');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update employee');
    }
  };

  // Handle Role Creation / Update
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingRole) {
        await apiRequest(`/access/roles/${editingRole.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: roleName,
            description: roleDesc || null,
            permissionCodes: selectedPerms,
          }),
        });
        setFeedback('Role updated successfully.');
      } else {
        await apiRequest('/access/roles', {
          method: 'POST',
          body: JSON.stringify({
            name: roleName,
            description: roleDesc || null,
            permissionCodes: selectedPerms,
          }),
        });
        setFeedback('Custom role created successfully.');
      }
      setRoleModal(false);
      setEditingRole(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save role');
    }
  };

  // Handle Role Deletion
  const handleDeleteRole = async (role: RoleRow) => {
    if (role.isSystem) return;
    if (!confirm(`Are you sure you want to delete role "${role.name}"?`)) return;
    setError(null);
    try {
      await apiRequest(`/access/roles/${role.id}`, { method: 'DELETE' });
      setFeedback('Role deleted successfully.');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to delete role');
    }
  };

  // Handle Invite
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDevInviteToken(null);
    try {
      const res = await apiRequest<{ devInviteToken?: string }>('/access/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: invEmail, roleId: invRoleId }),
      });
      setInvModal(false);
      setInvEmail('');
      setFeedback('Invitation created.');
      if (res.devInviteToken) setDevInviteToken(res.devInviteToken);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to send invitation');
    }
  };

  // Toggle Employee Active Status
  const toggleEmployeeStatus = async (emp: EmployeeRow) => {
    try {
      await apiRequest(`/access/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Status update failed');
    }
  };

  // Interactive Branch Access Matrix Toggle
  const handleToggleBranchAccess = async (emp: EmployeeRow, branchId: string) => {
    setUpdatingBranchEmpId(emp.id);
    setError(null);
    setFeedback(null);
    const hasBranch = emp.branches.some((b) => b.id === branchId);
    const updatedBranchIds = hasBranch
      ? emp.branches.filter((b) => b.id !== branchId).map((b) => b.id)
      : [...emp.branches.map((b) => b.id), branchId];

    try {
      await apiRequest(`/access/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ branchIds: updatedBranchIds }),
      });
      await loadAll();
      setFeedback(`Branch access updated for ${emp.name}.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update branch access');
    } finally {
      setUpdatingBranchEmpId(null);
    }
  };

  // Quick Action: Grant Access to All Branches
  const handleSetAllBranches = async (emp: EmployeeRow) => {
    if (!activeTenant?.branches) return;
    setUpdatingBranchEmpId(emp.id);
    setError(null);
    try {
      await apiRequest(`/access/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ branchIds: activeTenant.branches.map((b) => b.id) }),
      });
      await loadAll();
      setFeedback(`Granted access to all branches for ${emp.name}.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update branch access');
    } finally {
      setUpdatingBranchEmpId(null);
    }
  };

  // Quick Action: Restrict to Main Branch Only
  const handleSetMainBranchOnly = async (emp: EmployeeRow) => {
    if (!activeTenant?.branches || activeTenant.branches.length === 0) return;
    const mainBranch =
      activeTenant.branches.find((b: any) => b.isMain) ?? activeTenant.branches[0];
    if (!mainBranch) return;
    setUpdatingBranchEmpId(emp.id);
    setError(null);
    try {
      await apiRequest(`/access/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ branchIds: [mainBranch.id] }),
      });
      await loadAll();
      setFeedback(`Restricted ${emp.name} to main branch only.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update branch access');
    } finally {
      setUpdatingBranchEmpId(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.nav.access}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage employees, custom roles, granular permissions, and multi-branch authorization.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreateEmployees && (
              <button
                type="button"
                onClick={() => {
                  setEmpCode(`EMP-${String(employees.length + 1).padStart(3, '0')}`);
                  setEmpName('');
                  setEmpEmail('');
                  setEmpPhone('');
                  setEmpPos('Cashier');
                  setEmpHireDate(new Date().toISOString().slice(0, 10));
                  setEmpPassword('');
                  setEmpRoleId(roles[0]?.id ?? '');
                  setEmpBranches(activeTenant?.branches.map((b) => b.id) ?? []);
                  setEmpModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Employee
              </button>
            )}
            {canManageRoles && (
              <button
                type="button"
                onClick={() => {
                  setEditingRole(null);
                  setRoleName('');
                  setRoleDesc('');
                  setSelectedPerms([]);
                  setRoleModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
              >
                <Shield className="h-4 w-4" /> New Custom Role
              </button>
            )}
            {canCreateEmployees && (
              <button
                type="button"
                onClick={() => {
                  setInvRoleId(roles[0]?.id ?? '');
                  setInvModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
              >
                <Mail className="h-4 w-4" /> Invite Staff
              </button>
            )}
          </div>
        </div>

        {/* Executive KPI Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">Total Staff</span>
              <Users className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{employees.length}</p>
            <p className="mt-1 text-xs text-slate-500">
              {employees.filter((e) => e.status === 'ACTIVE').length} active employees
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">Login Accounts</span>
              <UserCheck className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {employees.filter((e) => e.hasLoginAccount).length}
            </p>
            <p className="mt-1 text-xs text-slate-500">Provisioned POS & back-office users</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">Configured Roles</span>
              <Shield className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{roles.length}</p>
            <p className="mt-1 text-xs text-slate-500">
              {roles.filter((r) => r.isSystem).length} system &bull;{' '}
              {roles.filter((r) => !r.isSystem).length} custom
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">Granular Perms</span>
              <Key className="h-4 w-4 text-purple-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{permissions.length}</p>
            <p className="mt-1 text-xs text-slate-500">Across {permissionModules.length} functional modules</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {(
            [
              { key: 'employees', label: `Employees (${employees.length})`, icon: Users },
              { key: 'roles', label: `Roles (${roles.length})`, icon: Shield },
              { key: 'permissions', label: `Permissions (${permissions.length})`, icon: Key },
              { key: 'branchAccess', label: 'Branch Access Matrix', icon: Building2 },
              { key: 'invitations', label: `Invitations (${invitations.length})`, icon: Mail },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold sm:text-sm transition-colors ${
                  tab === item.key ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </div>

        {/* Alerts & Feedback */}
        {feedback && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm flex items-start justify-between">
            <div>
              <p className="font-semibold">{feedback}</p>
              {devInviteToken && (
                <div className="mt-2 space-y-1 text-xs">
                  <p className="font-mono break-all text-slate-700">Token: {devInviteToken}</p>
                  <Link
                    href={`/accept-invitation?token=${encodeURIComponent(devInviteToken)}`}
                    className="inline-block font-bold text-emerald-700 underline"
                  >
                    Open Direct Accept Invitation Link &rarr;
                  </Link>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setDevInviteToken(null);
              }}
              className="text-emerald-600 hover:text-emerald-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm flex items-start justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 1. EMPLOYEES TAB */}
        {tab === 'employees' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder="Search staff by name, code, phone, position..."
                  className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-sm"
                />
              </div>

              <div>
                <select
                  value={empBranchFilter}
                  onChange={(e) => setEmpBranchFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="ALL">All Branches</option>
                  {(activeTenant?.branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={empStatusFilter}
                  onChange={(e) => setEmpStatusFilter(e.target.value as any)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">Active Staff</option>
                  <option value="INACTIVE">Inactive Staff</option>
                </select>
              </div>

              {(empSearch || empBranchFilter !== 'ALL' || empStatusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setEmpSearch('');
                    setEmpBranchFilter('ALL');
                    setEmpStatusFilter('ALL');
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Employees Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Contact Info</th>
                    <th className="px-4 py-3">Position &amp; Hire Date</th>
                    <th className="px-4 py-3">Roles</th>
                    <th className="px-4 py-3">Branch Access</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No employees found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                              {emp.name
                                .split(' ')
                                .map((p) => p[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{emp.name}</p>
                              <div className="font-mono text-[11px] text-slate-400">
                                {emp.employeeCode}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {emp.email && <div className="truncate max-w-[170px]">{emp.email}</div>}
                          {emp.phone && <div className="text-slate-500 font-mono text-[11px]">{emp.phone}</div>}
                          {!emp.email && !emp.phone && <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">
                          <div className="font-medium text-slate-900">{emp.position || 'Staff'}</div>
                          <div className="text-[11px] text-slate-500">
                            {emp.hireDate ? `Hired: ${new Date(emp.hireDate).toLocaleDateString()}` : '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {emp.roles.length > 0 ? (
                              emp.roles.map((r) => (
                                <span
                                  key={r.id}
                                  className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700"
                                >
                                  <Shield className="h-3 w-3" /> {r.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">No login role</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {emp.branches.length > 0 ? (
                              emp.branches.map((b) => (
                                <span
                                  key={b.id}
                                  className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                                >
                                  {b.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">No branches</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {emp.hasLoginAccount ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active User
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                              No Account
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              emp.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {emp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canUpdateEmployees ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditEmployeeModal(emp)}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                <Edit3 className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleEmployeeStatus(emp)}
                                className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                {emp.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Read-only</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <DataTablePagination
                currentPage={empPage}
                pageSize={empPageSize}
                totalItems={filteredEmployees.length}
                onPageChange={setEmpPage}
                onPageSizeChange={setEmpPageSize}
                itemName="staff members"
              />
            </div>
          </div>
        )}

        {/* 2. ROLES TAB */}
        {tab === 'roles' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    placeholder="Search roles by name, description, permission code..."
                    className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-sm"
                  />
                </div>

                <div>
                  <select
                    value={roleTypeFilter}
                    onChange={(e) => setRoleTypeFilter(e.target.value as any)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    <option value="ALL">All Roles ({roles.length})</option>
                    <option value="SYSTEM">System Roles ({roles.filter((r) => r.isSystem).length})</option>
                    <option value="CUSTOM">Custom Roles ({roles.filter((r) => !r.isSystem).length})</option>
                  </select>
                </div>

                {(roleSearch || roleTypeFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setRoleSearch('');
                      setRoleTypeFilter('ALL');
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Reset
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setRoleViewMode('table')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      roleViewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" /> Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleViewMode('cards')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      roleViewMode === 'cards' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> Cards
                  </button>
                </div>

                {canManageRoles && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRole(null);
                      setRoleName('');
                      setRoleDesc('');
                      setSelectedPerms([]);
                      setRoleModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Custom Role
                  </button>
                )}
              </div>
            </div>

            {/* Table View */}
            {roleViewMode === 'table' ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="border-b border-slate-200 bg-slate-50/75 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Role Name & Scope</th>
                      <th className="px-4 py-3 font-semibold">Description</th>
                      <th className="px-4 py-3 font-semibold">Staff Assigned</th>
                      <th className="px-4 py-3 font-semibold">Granted Permissions</th>
                      <th className="px-4 py-3 font-semibold">Created Date</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRoles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                          No roles found matching your search or filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedRoles.map((role) => (
                        <tr key={role.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{role.name}</span>
                              {role.isSystem ? (
                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                                  <Lock className="h-3 w-3" /> System
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                                  Custom
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-slate-400">ID: {role.id.slice(0, 8)}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                            {role.description || <span className="italic text-slate-400">Standard role definition</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                              <Users className="h-3.5 w-3.5 text-slate-500" />
                              {role.memberCount} staff
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1 max-w-sm">
                              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                {role.permissions.length} perms
                              </span>
                              {role.permissions.slice(0, 2).map((code) => (
                                <span
                                  key={code}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
                                >
                                  {code}
                                </span>
                              ))}
                              {role.permissions.length > 2 && (
                                <span className="text-[11px] text-slate-400">
                                  +{role.permissions.length - 2} more
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {role.createdAt
                              ? new Date(role.createdAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : 'System default'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canManageRoles && !role.isSystem ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRole(role);
                                    setRoleName(role.name);
                                    setRoleDesc(role.description ?? '');
                                    setSelectedPerms([...role.permissions]);
                                    setError(null);
                                    setRoleModal(true);
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <Edit3 className="h-3.5 w-3.5" /> Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={role.memberCount > 0}
                                  title={
                                    role.memberCount > 0
                                      ? 'Unassign members from this role before deleting'
                                      : 'Delete custom role'
                                  }
                                  onClick={() => void handleDeleteRole(role)}
                                  className="inline-flex items-center gap-1 rounded border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </button>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                <Lock className="h-3 w-3" /> System Protected
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Card Grid View */
              <div className="grid gap-4 sm:grid-cols-2">
                {paginatedRoles.map((role) => (
                  <div
                    key={role.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-slate-900">{role.name}</h3>
                          {role.isSystem ? (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                              System Role
                            </span>
                          ) : (
                            <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                              Custom Role
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{role.description || 'Standard organizational role.'}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 shrink-0">
                        {role.memberCount} staff
                      </span>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-400 mb-1.5 flex justify-between">
                        <span>Authorized Permissions</span>
                        <span>{role.permissions.length} total</span>
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto p-1 border border-slate-100 rounded-lg bg-slate-50/50">
                        {role.permissions.length === 0 ? (
                          <span className="text-xs text-slate-400">No permissions assigned</span>
                        ) : (
                          role.permissions.map((code) => (
                            <span
                              key={code}
                              className="rounded bg-white border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 shadow-2xs"
                            >
                              {code}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {canManageRoles && !role.isSystem && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRole(role);
                            setRoleName(role.name);
                            setRoleDesc(role.description ?? '');
                            setSelectedPerms([...role.permissions]);
                            setError(null);
                            setRoleModal(true);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Edit Permissions
                        </button>
                        <button
                          type="button"
                          disabled={role.memberCount > 0}
                          title={
                            role.memberCount > 0
                              ? 'Unassign members from this role before deleting'
                              : 'Delete custom role'
                          }
                          onClick={() => void handleDeleteRole(role)}
                          className="inline-flex items-center gap-1 rounded border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Roles Pagination */}
            <DataTablePagination
              currentPage={rolePage}
              pageSize={rolePageSize}
              totalItems={filteredRoles.length}
              onPageChange={setRolePage}
              onPageSizeChange={setRolePageSize}
              itemName="roles"
            />
          </div>
        )}

        {/* 3. PERMISSIONS TAB */}
        {tab === 'permissions' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={permSearch}
                  onChange={(e) => setPermSearch(e.target.value)}
                  placeholder="Search by code (e.g. sales.create, inventory.transfer) or description..."
                  className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-sm"
                />
              </div>

              <div>
                <select
                  value={permModuleFilter}
                  onChange={(e) => setPermModuleFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="ALL">All Modules ({permissionModules.length})</option>
                  {permissionModules.map((m) => (
                    <option key={m} value={m}>
                      {m.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {(permSearch || permModuleFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setPermSearch('');
                    setPermModuleFilter('ALL');
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Permissions Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Permission Code</th>
                    <th className="px-4 py-3">Module</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Assigned Roles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPermissions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No permissions found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredPermissions.map((perm) => {
                      const rolesWithPerm = roles.filter((r) => r.permissions.includes(perm.code));
                      return (
                        <tr key={perm.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-800">
                              {perm.code}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 uppercase">
                              {perm.module}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {perm.description || 'System operation permission.'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {rolesWithPerm.length > 0 ? (
                                rolesWithPerm.map((r) => (
                                  <span
                                    key={r.id}
                                    className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
                                  >
                                    {r.name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400">None</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. BRANCH ACCESS MATRIX TAB */}
        {tab === 'branchAccess' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">Multi-Branch Authorization Matrix</h3>
                <p className="text-xs text-slate-500">
                  Click any store cell to grant or revoke branch terminal access for specific employees.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                {activeTenant?.branches?.length ?? 0} store branches configured
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 min-w-[200px]">Employee</th>
                    <th className="px-4 py-3">Position</th>
                    {(activeTenant?.branches ?? []).map((b) => (
                      <th key={b.id} className="px-4 py-3 text-center min-w-[140px]">
                        <div>{b.name}</div>
                        <span className="font-mono text-[10px] text-slate-400">({b.branchCode})</span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right">Quick Presets</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map((emp) => {
                    const isBusy = updatingBranchEmpId === emp.id;
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{emp.name}</div>
                          <div className="font-mono text-[11px] text-slate-400">{emp.employeeCode}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{emp.position || 'Staff'}</td>
                        {(activeTenant?.branches ?? []).map((branch) => {
                          const hasAccess = emp.branches.some((b) => b.id === branch.id);
                          return (
                            <td key={branch.id} className="px-4 py-3 text-center">
                              {canUpdateEmployees ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleToggleBranchAccess(emp, branch.id)}
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                                    hasAccess
                                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                  }`}
                                >
                                  {hasAccess ? (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Authorized
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-3 w-3" /> Grant
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span
                                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                                    hasAccess ? 'bg-emerald-500' : 'bg-slate-300'
                                  }`}
                                />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right">
                          {canUpdateEmployees && (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSetAllBranches(emp)}
                                className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                All
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSetMainBranchOnly(emp)}
                                className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Main
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <DataTablePagination
                currentPage={empPage}
                pageSize={empPageSize}
                totalItems={filteredEmployees.length}
                onPageChange={setEmpPage}
                onPageSizeChange={setEmpPageSize}
                itemName="staff members"
              />
            </div>
          </div>
        )}

        {/* 5. INVITATIONS TAB */}
        {tab === 'invitations' && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Invited Email</th>
                  <th className="px-4 py-3">Assigned Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expires At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No team invitations pending.
                    </td>
                  </tr>
                ) : (
                  invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{inv.email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          {inv.role.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            inv.status === 'ACCEPTED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : inv.status === 'PENDING'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Employee Modal */}
        {empModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">Add Staff Employee</h2>
                <button
                  type="button"
                  onClick={() => setEmpModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateEmployee} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Employee Code</label>
                    <input
                      required
                      value={empCode}
                      onChange={(e) => setEmpCode(e.target.value.toUpperCase())}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Job Position</label>
                    <input
                      value={empPos}
                      onChange={(e) => setEmpPos(e.target.value)}
                      placeholder="e.g. Cashier, Store Lead"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                    <input
                      required
                      value={empName}
                      onChange={(e) => setEmpName(e.target.value)}
                      placeholder="Enter staff full name"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Hire Date</label>
                    <input
                      type="date"
                      value={empHireDate}
                      onChange={(e) => setEmpHireDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Email Address</label>
                    <input
                      type="email"
                      required={createAccount}
                      value={empEmail}
                      onChange={(e) => setEmpEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Phone Number</label>
                    <input
                      value={empPhone}
                      onChange={(e) => setEmpPhone(e.target.value)}
                      placeholder="+855 12 345 678"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">
                    Authorized Store Branches
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(activeTenant?.branches ?? []).map((b) => (
                      <label
                        key={b.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs cursor-pointer hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={empBranches.includes(b.id)}
                          onChange={(e) =>
                            setEmpBranches((prev) =>
                              e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                            )
                          }
                          className="h-3.5 w-3.5 rounded text-emerald-600"
                        />
                        <span>
                          {b.name} <span className="text-slate-400">({b.branchCode})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createAccount}
                    onChange={(e) => setCreateAccount(e.target.checked)}
                    className="h-4 w-4 rounded text-emerald-600"
                  />
                  <div>
                    <span className="font-semibold text-slate-900">Provision User Login Account</span>
                    <p className="text-xs text-slate-500">Allow this employee to sign into POS and management tools</p>
                  </div>
                </label>

                {createAccount && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Primary Role</label>
                      <select
                        value={empRoleId}
                        onChange={(e) => setEmpRoleId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Initial Password</label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={empPassword}
                        onChange={(e) => setEmpPassword(e.target.value)}
                        placeholder="Min 8 characters"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEmpModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    Create Employee
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Employee Modal */}
        {editingEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Edit Staff Profile</h2>
                  <p className="text-xs text-slate-500 font-mono">{editingEmployee.employeeCode}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateEmployee} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                    <input
                      required
                      value={editEmpName}
                      onChange={(e) => setEditEmpName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Position</label>
                    <input
                      value={editEmpPos}
                      onChange={(e) => setEditEmpPos(e.target.value)}
                      placeholder="e.g. Cashier, Store Lead"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Email Address</label>
                    <input
                      type="email"
                      value={editEmpEmail}
                      onChange={(e) => setEditEmpEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Phone Number</label>
                    <input
                      value={editEmpPhone}
                      onChange={(e) => setEditEmpPhone(e.target.value)}
                      placeholder="+855 12 345 678"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Hire Date</label>
                    <input
                      type="date"
                      value={editEmpHireDate}
                      onChange={(e) => setEditEmpHireDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">
                    Branch Terminal Authorizations
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(activeTenant?.branches ?? []).map((b) => (
                      <label
                        key={b.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs cursor-pointer hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={editEmpBranches.includes(b.id)}
                          onChange={(e) =>
                            setEditEmpBranches((prev) =>
                              e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                            )
                          }
                          className="h-3.5 w-3.5 rounded text-emerald-600"
                        />
                        <span>
                          {b.name} <span className="text-slate-400">({b.branchCode})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">
                    Assigned Roles (Multi-Role Binding)
                  </label>
                  {editingEmployee.hasLoginAccount ? (
                    <div className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 max-h-48 overflow-y-auto">
                      {roles.map((r) => (
                        <label key={r.id} className="flex items-start gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editEmpRoles.includes(r.id)}
                            onChange={(e) =>
                              setEditEmpRoles((prev) =>
                                e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                              )
                            }
                            className="mt-0.5 h-3.5 w-3.5 rounded text-emerald-600"
                          />
                          <span>
                            <strong className="font-semibold text-slate-900">{r.name}</strong>
                            {r.description && (
                              <span className="block text-[11px] text-slate-500">{r.description}</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      This staff profile does not have an active login account. Invite them or provision credentials to assign roles.
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingEmployee(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Role Modal */}
        {roleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingRole ? `Edit Role — ${editingRole.name}` : 'Create Custom Role'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setRoleModal(false);
                    setEditingRole(null);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveRole} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Role Name</label>
                    <input
                      required
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      placeholder="e.g. Shift Lead, Inventory Clerk"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Description</label>
                    <input
                      value={roleDesc}
                      onChange={(e) => setRoleDesc(e.target.value)}
                      placeholder="Role operational scope"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Permission Assignments ({selectedPerms.length} selected)
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPerms(permissions.map((p) => p.code))}
                        className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPerms([])}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="grid max-h-72 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
                    {permissions.map((perm) => (
                      <label
                        key={perm.id}
                        className="flex items-start gap-2 text-xs rounded p-1.5 hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPerms.includes(perm.code)}
                          onChange={(e) =>
                            setSelectedPerms((prev) =>
                              e.target.checked
                                ? [...prev, perm.code]
                                : prev.filter((c) => c !== perm.code),
                            )
                          }
                          className="mt-0.5 h-3.5 w-3.5 rounded text-emerald-600"
                        />
                        <div>
                          <strong className="font-mono text-slate-900">{perm.code}</strong>
                          <span className="block text-[11px] text-slate-500">{perm.description}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setRoleModal(false);
                      setEditingRole(null);
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    {editingRole ? 'Save Changes' : 'Create Role'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Invite Modal */}
        {invModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">Invite Staff Member</h2>
                <button
                  type="button"
                  onClick={() => setInvModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Invitee Email Address</label>
                  <input
                    type="email"
                    required
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    placeholder="staff@company.com"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Initial Assigned Role</label>
                  <select
                    value={invRoleId}
                    onChange={(e) => setInvRoleId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setInvModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    Send Invitation
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
