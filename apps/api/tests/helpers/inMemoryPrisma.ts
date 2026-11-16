import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;

function uuid() {
  return crypto.randomUUID();
}

function dec(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return {
    toString: () => str,
    valueOf: () => Number(str),
    toJSON: () => str,
  };
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

export function createInMemoryPrisma() {
  const store = {
    tenants: [] as Row[],
    branches: [] as Row[],
    users: [] as Row[],
    tenantUsers: [] as Row[],
    userSessions: [] as Row[],
    passwordResetTokens: [] as Row[],
    tenantInvitations: [] as Row[],
    employees: [] as Row[],
    roles: [] as Row[],
    permissions: [] as Row[],
    rolePermissions: [] as Row[],
    userRoles: [] as Row[],
    employeeBranchAccess: [] as Row[],
    categories: [] as Row[],
    units: [] as Row[],
    suppliers: [] as Row[],
    products: [] as Row[],
    customers: [] as Row[],
    orders: [] as Row[],
    orderItems: [] as Row[],
    payments: [] as Row[],
    saleReturns: [] as Row[],
    saleReturnItems: [] as Row[],
    purchases: [] as Row[],
    purchaseItems: [] as Row[],
    purchasePayments: [] as Row[],
    stockBalances: [] as Row[],
    stockMovements: [] as Row[],
    stockAdjustments: [] as Row[],
    shifts: [] as Row[],
    expenseTypes: [] as Row[],
    expenses: [] as Row[],
    incomes: [] as Row[],
    settings: [] as Row[],
    exchangeRates: [] as Row[],
    activityLogs: [] as Row[],
    stockTransfers: [] as Row[],
    stockTransferItems: [] as Row[],
    subscriptionPlans: [] as Row[],
    tenantSubscriptions: [] as Row[],
    subscriptionInvoices: [] as Row[],
    paymentWebhookLogs: [] as Row[],
  };

  function reset() {
    Object.values(store).forEach((arr) => {
      arr.length = 0;
    });
  }

  function matchCondition(val: any, cond: any): boolean {
    if (cond === undefined) return true;
    if (cond instanceof Date) {
      return val instanceof Date ? val.getTime() === cond.getTime() : val === cond;
    }
    if (cond !== null && typeof cond === 'object') {
      const ops = ['in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'contains', 'equals', 'not'];
      if (ops.some((k) => k in cond)) {
        if ('in' in cond && Array.isArray(cond.in) && !cond.in.includes(val)) return false;
        if ('notIn' in cond && Array.isArray(cond.notIn) && cond.notIn.includes(val)) return false;
        if ('gt' in cond && cond.gt !== undefined && !(val > cond.gt)) return false;
        if ('gte' in cond && cond.gte !== undefined && !(val >= cond.gte)) return false;
        if ('lt' in cond && cond.lt !== undefined && !(val < cond.lt)) return false;
        if ('lte' in cond && cond.lte !== undefined && !(val <= cond.lte)) return false;
        if ('contains' in cond && cond.contains !== undefined) {
          if (typeof val !== 'string') return false;
          const ok =
            cond.mode === 'insensitive'
              ? val.toLowerCase().includes(String(cond.contains).toLowerCase())
              : val.includes(String(cond.contains));
          if (!ok) return false;
        }
        if ('equals' in cond && val !== cond.equals) return false;
        if ('not' in cond) {
          if (typeof cond.not === 'object' && cond.not !== null) {
            if ('in' in cond.not && Array.isArray(cond.not.in) && cond.not.in.includes(val)) return false;
          } else if (val === cond.not) {
            return false;
          }
        }
        return true;
      }
    }
    return val === cond;
  }

  function matchesWhere(row: Row, where: Row = {}): boolean {
    for (const [key, val] of Object.entries(where)) {
      if (val === undefined) continue;
      if (key === 'OR' && Array.isArray(val)) {
        if (!val.some((sub) => matchesWhere(row, sub))) return false;
        continue;
      }
      if (key === 'tenant' && val && typeof val === 'object') {
        const tenant = store.tenants.find((t) => t.id === row.tenantId);
        if (!tenant || !matchesWhere(tenant, val)) return false;
        continue;
      }
      if (key === 'product' && val && typeof val === 'object') {
        const product = store.products.find((p) => p.id === row.productId);
        if (!product || !matchesWhere(product, val)) return false;
        continue;
      }
      if (key === 'customer' && val && typeof val === 'object') {
        const customer = store.customers.find((c) => c.id === row.customerId);
        if (!customer || !matchesWhere(customer, val)) return false;
        continue;
      }
      if (key === 'order' && val && typeof val === 'object') {
        const order = store.orders.find((o) => o.id === row.orderId);
        if (!order || !matchesWhere(order, val)) return false;
        continue;
      }
      if (key === 'supplier' && val && typeof val === 'object') {
        const supplier = store.suppliers.find((s) => s.id === row.supplierId);
        if (!supplier || !matchesWhere(supplier, val)) return false;
        continue;
      }
      if (key === 'purchase' && val && typeof val === 'object') {
        const purchase = store.purchases.find((p) => p.id === row.purchaseId);
        if (!purchase || !matchesWhere(purchase, val)) return false;
        continue;
      }
      if (key === 'expenseType' && val && typeof val === 'object') {
        const expenseType = store.expenseTypes.find((et) => et.id === row.expenseTypeId);
        if (!expenseType || !matchesWhere(expenseType, val)) return false;
        continue;
      }
      if (key === 'user' && val && typeof val === 'object') {
        const user = store.users.find((u) => u.id === row.userId);
        if (!user || !matchesWhere(user, val)) return false;
        continue;
      }
      if (key === 'employee' && val && typeof val === 'object') {
        const employee = store.employees.find((e) => e.id === row.employeeId);
        if (!employee || !matchesWhere(employee, val)) return false;
        continue;
      }
      if (!matchCondition(row[key], val)) return false;
    }
    return true;
  }

  function applyOrderBy(rows: Row[], orderBy?: Row | Row[]): Row[] {
    if (!orderBy) return [...rows];
    const criteria = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...rows].sort((a, b) => {
      for (const crit of criteria) {
        const [[field, dir]] = Object.entries(crit);
        const av = a[field];
        const bv = b[field];
        if (av === bv) continue;
        if (av instanceof Date && bv instanceof Date) {
          const cmp = av.getTime() - bv.getTime();
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        } else if (typeof av === 'boolean' && typeof bv === 'boolean') {
          const cmp = Number(av) - Number(bv);
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        } else {
          const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        }
      }
      return 0;
    });
  }

  function enrichRole(role: Row, include?: Row) {
    const out: Row = { ...role };
    if (!include || include.rolePermissions) {
      out.rolePermissions = store.rolePermissions
        .filter((rp) => rp.roleId === role.id)
        .map((rp) => ({
          ...rp,
          permission: store.permissions.find((p) => p.id === rp.permissionId),
        }));
    }
    if (include?._count) {
      out._count = {
        userRoles: store.userRoles.filter((ur) => ur.roleId === role.id).length,
      };
    }
    return out;
  }

  function enrichTenantUser(tu: Row, include?: Row) {
    if (!include) return { ...tu };
    const out: Row = { ...tu };
    if (include.tenant) {
      const tenant = store.tenants.find((t) => t.id === tu.tenantId);
      if (tenant) {
        const tOut: Row = { ...tenant };
        const tInc = include.tenant.include ?? {};
        if (tInc.branches) {
          tOut.branches = store.branches
            .filter(
              (b) =>
                b.tenantId === tenant.id &&
                (!tInc.branches.where || matchesWhere(b, tInc.branches.where)),
            )
            .sort((a, b) => Number(b.isMain) - Number(a.isMain));
        }
        if (tInc.exchangeRates) {
          tOut.exchangeRates = applyOrderBy(
            store.exchangeRates.filter((er) => er.tenantId === tenant.id),
            tInc.exchangeRates.orderBy ?? { effectiveAt: 'desc' },
          ).slice(0, tInc.exchangeRates.take ?? 10);
        }
        out.tenant = tOut;
      }
    }
    if (include.user) {
      out.user = store.users.find((u) => u.id === tu.userId);
    }
    if (include.employees) {
      out.employees = store.employees.filter(
        (e) =>
          e.tenantUserId === tu.id &&
          (!include.employees.where || matchesWhere(e, include.employees.where)),
      );
    }
    if (include.userRoles) {
      out.userRoles = store.userRoles
        .filter((ur) => ur.tenantUserId === tu.id)
        .map((ur) => {
          const role = store.roles.find((r) => r.id === ur.roleId);
          return { ...ur, role: role ? enrichRole(role) : undefined };
        });
    }
    return out;
  }

  function enrichProduct(p: Row, include?: Row) {
    const out: Row = { ...p };
    if (include?.category) {
      out.category = store.categories.find((c) => c.id === p.categoryId) ?? null;
    }
    if (include?.unit) {
      out.unit = store.units.find((u) => u.id === p.unitId) ?? null;
    }
    if (include?.stockBalances) {
      const sbWhere = include.stockBalances.where ?? {};
      out.stockBalances = store.stockBalances.filter(
        (sb) => sb.productId === p.id && matchesWhere(sb, sbWhere),
      );
    }
    return out;
  }

  function enrichOrder(o: Row, include?: Row) {
    const out: Row = { ...o };
    if (include?.tenant) out.tenant = store.tenants.find((t) => t.id === o.tenantId) ?? null;
    if (include?.branch) out.branch = store.branches.find((b) => b.id === o.branchId) ?? null;
    if (include?.customer) {
      out.customer = o.customerId
        ? store.customers.find((c) => c.id === o.customerId) ?? null
        : null;
    }
    if (include?.cashierEmployee) {
      out.cashierEmployee = store.employees.find((e) => e.id === o.cashierEmployeeId) ?? null;
    }
    if (include?.orderItems) {
      const items = store.orderItems.filter((oi) => oi.orderId === o.id);
      if (typeof include.orderItems === 'object' && include.orderItems.include?.product) {
        out.orderItems = items.map((oi) => ({
          ...oi,
          product: store.products.find((p) => p.id === oi.productId) ?? null,
        }));
      } else {
        out.orderItems = items;
      }
    }
    if (include?.payments) {
      out.payments = store.payments.filter((p) => p.orderId === o.id);
    }
    if (include?.saleReturns) {
      out.saleReturns = store.saleReturns
        .filter((sr) => sr.orderId === o.id)
        .map((sr) => ({
          ...sr,
          saleReturnItems: store.saleReturnItems.filter((sri) => sri.saleReturnId === sr.id),
        }));
    }
    if (include?._count) {
      out._count = {
        orderItems: store.orderItems.filter((oi) => oi.orderId === o.id).length,
        payments: store.payments.filter((p) => p.orderId === o.id).length,
      };
    }
    return out;
  }

  function enrichPurchase(p: Row, include?: Row) {
    const out: Row = { ...p };
    if (include?.branch) out.branch = store.branches.find((b) => b.id === p.branchId) ?? null;
    if (include?.supplier) out.supplier = store.suppliers.find((s) => s.id === p.supplierId) ?? null;
    if (include?.employee) out.employee = store.employees.find((e) => e.id === p.employeeId) ?? null;
    if (include?.purchaseItems) {
      out.purchaseItems = store.purchaseItems
        .filter((pi) => pi.purchaseId === p.id)
        .map((pi) => ({
          ...pi,
          product: store.products.find((pr) => pr.id === pi.productId) ?? null,
        }));
    }
    if (include?.purchasePayments) {
      out.purchasePayments = store.purchasePayments.filter((pp) => pp.purchaseId === p.id);
    }
    if (include?._count) {
      out._count = {
        purchaseItems: store.purchaseItems.filter((pi) => pi.purchaseId === p.id).length,
        purchasePayments: store.purchasePayments.filter((pp) => pp.purchaseId === p.id).length,
      };
    }
    return out;
  }

  const client: any = {
    reset,
    store,
    $transaction: async (fnOrPromises: any) => {
      if (Array.isArray(fnOrPromises)) {
        return Promise.all(fnOrPromises);
      }
      return fnOrPromises(client);
    },

    permission: {
      findMany: async ({ where, orderBy }: { where?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.permissions.filter((p) => matchesWhere(p, where)),
          orderBy,
        ),
      createMany: async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const item of data) {
          if (store.permissions.some((p) => p.code === item.code)) {
            if (skipDuplicates) continue;
            throw p2002();
          }
          store.permissions.push({ id: uuid(), ...item });
          count += 1;
        }
        return { count };
      },
    },

    user: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.users.filter((u) => matchesWhere(u, where)).length,
      findMany: async ({ where, orderBy }: { where?: Row; orderBy?: any } = {}) =>
        applyOrderBy(store.users.filter((u) => matchesWhere(u, where)), orderBy),
      findUnique: async ({ where }: { where: Row }) => {
        const found = store.users.find((u) => matchesWhere(u, where));
        return found ? { ...found } : null;
      },
      create: async ({ data }: { data: Row }) => {
        if (store.users.some((u) => u.email === data.email)) throw p2002();
        const now = new Date();
        const row = {
          id: uuid(),
          phone: null,
          emailVerifiedAt: null,
          lastLoginAt: null,
          status: 'ACTIVE',
          isPlatformAdmin: false,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        store.users.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.users.findIndex((u) => matchesWhere(u, where));
        if (idx === -1) throw new Error('User not found');
        store.users[idx] = { ...store.users[idx], ...data, updatedAt: new Date() };
        return { ...store.users[idx] };
      },
    },

    tenant: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.tenants.filter((t) => matchesWhere(t, where)).length,
      findMany: async ({ include, orderBy }: { include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(store.tenants, orderBy).map((t) => ({
          ...t,
          ...(include?._count
            ? {
                _count: {
                  branches: store.branches.filter((b) => b.tenantId === t.id).length,
                  tenantUsers: store.tenantUsers.filter((tu) => tu.tenantId === t.id).length,
                  orders: store.orders.filter((o) => o.tenantId === t.id).length,
                },
              }
            : {}),
        })),
      findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
        const found = store.tenants.find((t) => matchesWhere(t, where));
        if (!found) return null;
        const out: Row = { ...found };
        if (include?.exchangeRates) {
          out.exchangeRates = applyOrderBy(
            store.exchangeRates.filter((er) => er.tenantId === found.id),
            include.exchangeRates.orderBy ?? { effectiveAt: 'desc' },
          ).slice(0, include.exchangeRates.take ?? 1);
        }
        if (include?._count) {
          out._count = {
            branches: store.branches.filter((b) => b.tenantId === found.id).length,
            employees: store.employees.filter((e) => e.tenantId === found.id).length,
            tenantUsers: store.tenantUsers.filter((tu) => tu.tenantId === found.id).length,
          };
        }
        return out;
      },
      create: async ({ data }: { data: Row }) => {
        if (store.tenants.some((t) => t.slug === data.slug)) throw p2002();
        const now = new Date();
        const row = {
          id: uuid(),
          email: null,
          phone: null,
          address: null,
          logoUrl: null,
          defaultCurrency: 'USD',
          defaultLanguage: 'en',
          timezone: 'Asia/Phnom_Penh',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        store.tenants.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.tenants.findIndex((t) => matchesWhere(t, where));
        if (idx === -1) throw new Error('Tenant not found');
        store.tenants[idx] = { ...store.tenants[idx], ...data, updatedAt: new Date() };
        return { ...store.tenants[idx] };
      },
    },

    branch: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.branches.filter((b) => matchesWhere(b, where)).length,
      findUnique: async ({ where }: { where: Row }) => {
        if (where.tenantId_branchCode) {
          const { tenantId, branchCode } = where.tenantId_branchCode;
          const found = store.branches.find(
            (b) => b.tenantId === tenantId && b.branchCode === branchCode,
          );
          return found ? { ...found } : null;
        }
        const found = store.branches.find((b) => matchesWhere(b, where));
        return found ? { ...found } : null;
      },
      findFirst: async ({ where, orderBy }: { where: Row; orderBy?: any }) => {
        const matched = applyOrderBy(
          store.branches.filter((b) => matchesWhere(b, where)),
          orderBy,
        );
        return matched[0] ? { ...matched[0] } : null;
      },
      findMany: async ({
        where,
        skip,
        take,
      }: {
        where?: Row;
        skip?: number;
        take?: number;
      } = {}) => {
        let list = store.branches
          .filter((b) => matchesWhere(b, where))
          .sort((a, b) => Number(b.isMain) - Number(a.isMain));
        if (typeof skip === 'number') list = list.slice(skip);
        if (typeof take === 'number') list = list.slice(0, take);
        return list.map((b) => ({ ...b }));
      },
      create: async ({ data }: { data: Row }) => {
        if (store.branches.some((b) => b.tenantId === data.tenantId && b.branchCode === data.branchCode)) {
          throw p2002();
        }
        const now = new Date();
        const row = {
          id: uuid(),
          phone: null,
          address: null,
          isMain: false,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        store.branches.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.branches.findIndex((b) => matchesWhere(b, where));
        if (idx === -1) throw new Error('Branch not found');
        store.branches[idx] = { ...store.branches[idx], ...data, updatedAt: new Date() };
        return { ...store.branches[idx] };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (let i = 0; i < store.branches.length; i += 1) {
          if (matchesWhere(store.branches[i], where)) {
            store.branches[i] = { ...store.branches[i], ...data, updatedAt: new Date() };
            count += 1;
          }
        }
        return { count };
      },
    },

    tenantUser: {
      findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
        let found: Row | undefined;
        if (where.tenantId_userId) {
          const { tenantId, userId } = where.tenantId_userId;
          found = store.tenantUsers.find(
            (tu) => tu.tenantId === tenantId && tu.userId === userId,
          );
        } else {
          found = store.tenantUsers.find((tu) => matchesWhere(tu, where));
        }
        return found ? enrichTenantUser(found, include) : null;
      },
      findMany: async ({ where, include }: { where?: Row; include?: Row } = {}) =>
        store.tenantUsers
          .filter((tu) => matchesWhere(tu, where))
          .map((tu) => enrichTenantUser(tu, include)),
      create: async ({ data }: { data: Row }) => {
        const row = { id: uuid(), status: 'ACTIVE', joinedAt: new Date(), ...data };
        store.tenantUsers.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.tenantUsers.findIndex((tu) => matchesWhere(tu, where));
        if (idx === -1) throw new Error('TenantUser not found');
        store.tenantUsers[idx] = { ...store.tenantUsers[idx], ...data };
        return { ...store.tenantUsers[idx] };
      },
    },

    role: {
      findUnique: async ({ where }: { where: Row }) => {
        if (where.tenantId_name) {
          const { tenantId, name } = where.tenantId_name;
          return store.roles.find((r) => r.tenantId === tenantId && r.name === name) ?? null;
        }
        return store.roles.find((r) => matchesWhere(r, where)) ?? null;
      },
      findFirst: async ({ where, include }: { where: Row; include?: Row }) => {
        const found = store.roles.find((r) => matchesWhere(r, where));
        return found ? enrichRole(found, include) : null;
      },
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.roles.filter((r) => matchesWhere(r, where)),
          orderBy,
        ).map((r) => enrichRole(r, include)),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = { id: uuid(), isSystem: false, createdAt: now, updatedAt: now, ...data };
        store.roles.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.roles.findIndex((r) => matchesWhere(r, where));
        if (idx === -1) throw new Error('Role not found');
        store.roles[idx] = { ...store.roles[idx], ...data, updatedAt: new Date() };
        return { ...store.roles[idx] };
      },
      delete: async ({ where }: { where: Row }) => {
        const idx = store.roles.findIndex((r) => matchesWhere(r, where));
        if (idx === -1) throw new Error('Role not found');
        const [removed] = store.roles.splice(idx, 1);
        store.rolePermissions = store.rolePermissions.filter((rp) => rp.roleId !== removed.id);
        return removed;
      },
    },

    rolePermission: {
      createMany: async ({ data }: { data: Row[] }) => {
        for (const item of data) store.rolePermissions.push({ id: uuid(), ...item });
        return { count: data.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = store.rolePermissions.length;
        store.rolePermissions = store.rolePermissions.filter((rp) => !matchesWhere(rp, where));
        return { count: before - store.rolePermissions.length };
      },
    },

    userRole: {
      findUnique: async ({ where }: { where: Row }) => {
        if (where.tenantUserId_roleId) {
          const { tenantUserId, roleId } = where.tenantUserId_roleId;
          return (
            store.userRoles.find(
              (ur) => ur.tenantUserId === tenantUserId && ur.roleId === roleId,
            ) ?? null
          );
        }
        return store.userRoles.find((ur) => matchesWhere(ur, where)) ?? null;
      },
      create: async ({ data }: { data: Row }) => {
        const row = { id: uuid(), ...data };
        store.userRoles.push(row);
        return { ...row };
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const item of data) store.userRoles.push({ id: uuid(), ...item });
        return { count: data.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = store.userRoles.length;
        store.userRoles = store.userRoles.filter((ur) => !matchesWhere(ur, where));
        return { count: before - store.userRoles.length };
      },
    },

    employee: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.employees.filter((e) => matchesWhere(e, where)).length,
      findUnique: async ({ where }: { where: Row }) => {
        if (where.tenantId_employeeCode) {
          const { tenantId, employeeCode } = where.tenantId_employeeCode;
          return (
            store.employees.find(
              (e) => e.tenantId === tenantId && e.employeeCode === employeeCode,
            ) ?? null
          );
        }
        return store.employees.find((e) => matchesWhere(e, where)) ?? null;
      },
      findFirst: async ({ where }: { where: Row }) =>
        store.employees.find((e) => matchesWhere(e, where)) ?? null,
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.employees.filter((e) => matchesWhere(e, where)),
          orderBy,
        ).map((e) => {
          const out: Row = { ...e };
          if (include?.branchAccess) {
            out.branchAccess = store.employeeBranchAccess
              .filter((ba) => ba.employeeId === e.id)
              .map((ba) => ({
                ...ba,
                branch: store.branches.find((b) => b.id === ba.branchId),
              }));
          }
          if (include?.tenantUser) {
            const tu = e.tenantUserId
              ? store.tenantUsers.find((u) => u.id === e.tenantUserId)
              : null;
            out.tenantUser = tu ? enrichTenantUser(tu, include.tenantUser.include) : null;
          }
          return out;
        }),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = { id: uuid(), status: 'ACTIVE', createdAt: now, updatedAt: now, ...data };
        store.employees.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.employees.findIndex((e) => matchesWhere(e, where));
        if (idx === -1) throw new Error('Employee not found');
        store.employees[idx] = { ...store.employees[idx], ...data, updatedAt: new Date() };
        return { ...store.employees[idx] };
      },
    },

    employeeBranchAccess: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: uuid(), ...data };
        store.employeeBranchAccess.push(row);
        return { ...row };
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const item of data) store.employeeBranchAccess.push({ id: uuid(), ...item });
        return { count: data.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = store.employeeBranchAccess.length;
        store.employeeBranchAccess = store.employeeBranchAccess.filter((ba) => !matchesWhere(ba, where));
        return { count: before - store.employeeBranchAccess.length };
      },
    },

    tenantInvitation: {
      findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
        const found = store.tenantInvitations.find((ti) => matchesWhere(ti, where));
        if (!found) return null;
        const out: Row = { ...found };
        if (include?.tenant) out.tenant = store.tenants.find((t) => t.id === found.tenantId) ?? null;
        if (include?.role) out.role = store.roles.find((r) => r.id === found.roleId) ?? null;
        return out;
      },
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.tenantInvitations.filter((ti) => matchesWhere(ti, where)),
          orderBy,
        ).map((ti) => ({
          ...ti,
          ...(include?.role ? { role: store.roles.find((r) => r.id === ti.roleId) ?? null } : {}),
        })),
      create: async ({ data, include }: { data: Row; include?: Row }) => {
        const row = { id: uuid(), acceptedAt: null, createdAt: new Date(), ...data };
        store.tenantInvitations.push(row);
        const out: Row = { ...row };
        if (include?.role) out.role = store.roles.find((r) => r.id === row.roleId) ?? null;
        return out;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.tenantInvitations.findIndex((ti) => matchesWhere(ti, where));
        if (idx === -1) throw new Error('Invitation not found');
        store.tenantInvitations[idx] = { ...store.tenantInvitations[idx], ...data };
        return { ...store.tenantInvitations[idx] };
      },
    },

    category: {
      findFirst: async ({ where }: { where: Row }) =>
        store.categories.find((c) => matchesWhere(c, where)) ?? null,
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.categories.filter((c) => matchesWhere(c, where)),
          orderBy,
        ).map((c) => ({
          ...c,
          ...(include?.parent
            ? { parent: c.parentId ? store.categories.find((p) => p.id === c.parentId) ?? null : null }
            : {}),
          ...(include?._count
            ? { _count: { products: store.products.filter((pr) => pr.categoryId === c.id).length } }
            : {}),
        })),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = { id: uuid(), status: 'ACTIVE', createdAt: now, updatedAt: now, ...data };
        store.categories.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.categories.findIndex((c) => matchesWhere(c, where));
        if (idx === -1) throw new Error('Category not found');
        store.categories[idx] = { ...store.categories[idx], ...data, updatedAt: new Date() };
        return { ...store.categories[idx] };
      },
    },

    unit: {
      findFirst: async ({ where }: { where: Row }) =>
        store.units.find((u) => matchesWhere(u, where)) ?? null,
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.units.filter((u) => matchesWhere(u, where)),
          orderBy,
        ).map((u) => ({
          ...u,
          ...(include?._count
            ? { _count: { products: store.products.filter((pr) => pr.unitId === u.id).length } }
            : {}),
        })),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = { id: uuid(), status: 'ACTIVE', createdAt: now, updatedAt: now, ...data };
        store.units.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.units.findIndex((u) => matchesWhere(u, where));
        if (idx === -1) throw new Error('Unit not found');
        store.units[idx] = { ...store.units[idx], ...data, updatedAt: new Date() };
        return { ...store.units[idx] };
      },
    },

    supplier: {
      findFirst: async ({ where }: { where: Row }) =>
        store.suppliers.find((s) => matchesWhere(s, where)) ?? null,
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.suppliers.filter((s) => matchesWhere(s, where)),
          orderBy,
        ).map((s) => ({
          ...s,
          ...(include?._count
            ? { _count: { purchases: store.purchases.filter((pu) => pu.supplierId === s.id).length } }
            : {}),
        })),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = { id: uuid(), status: 'ACTIVE', createdAt: now, updatedAt: now, ...data };
        store.suppliers.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.suppliers.findIndex((s) => matchesWhere(s, where));
        if (idx === -1) throw new Error('Supplier not found');
        store.suppliers[idx] = { ...store.suppliers[idx], ...data, updatedAt: new Date() };
        return { ...store.suppliers[idx] };
      },
    },

    product: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.products.filter((p) => matchesWhere(p, where)).length,
      findUnique: async ({ where }: { where: Row }) => {
        if (where.tenantId_sku) {
          const { tenantId, sku } = where.tenantId_sku;
          return store.products.find((p) => p.tenantId === tenantId && p.sku === sku) ?? null;
        }
        if (where.tenantId_barcode) {
          const { tenantId, barcode } = where.tenantId_barcode;
          return store.products.find((p) => p.tenantId === tenantId && p.barcode === barcode) ?? null;
        }
        return store.products.find((p) => matchesWhere(p, where)) ?? null;
      },
      findFirst: async ({ where }: { where: Row }) =>
        store.products.find((p) => matchesWhere(p, where)) ?? null,
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.products.filter((p) => matchesWhere(p, where)),
          orderBy,
        ).map((p) => enrichProduct(p, include)),
      create: async ({ data, include }: { data: Row; include?: Row }) => {
        const now = new Date();
        const row = {
          id: uuid(),
          status: 'ACTIVE',
          costPrice: dec(data.costPrice),
          sellingPrice: dec(data.sellingPrice),
          wholesalePrice: dec(data.wholesalePrice),
          lowStockAlert: dec(data.lowStockAlert ?? '0'),
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        row.costPrice = dec(data.costPrice);
        row.sellingPrice = dec(data.sellingPrice);
        row.wholesalePrice = dec(data.wholesalePrice);
        row.lowStockAlert = dec(data.lowStockAlert ?? '0');
        store.products.push(row);
        return enrichProduct(row, include);
      },
      update: async ({ where, data, include }: { where: Row; data: Row; include?: Row }) => {
        const idx = store.products.findIndex((p) => matchesWhere(p, where));
        if (idx === -1) throw new Error('Product not found');
        const next = { ...store.products[idx], ...data, updatedAt: new Date() };
        if (data.costPrice !== undefined) next.costPrice = dec(data.costPrice);
        if (data.sellingPrice !== undefined) next.sellingPrice = dec(data.sellingPrice);
        if (data.wholesalePrice !== undefined) next.wholesalePrice = dec(data.wholesalePrice);
        if (data.lowStockAlert !== undefined) next.lowStockAlert = dec(data.lowStockAlert);
        store.products[idx] = next;
        return enrichProduct(next, include);
      },
    },

    customer: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.customers.filter((c) => matchesWhere(c, where)).length,
      findUnique: async ({ where }: { where: Row }) => {
        if (where.tenantId_customerCode) {
          const { tenantId, customerCode } = where.tenantId_customerCode;
          return (
            store.customers.find(
              (c) => c.tenantId === tenantId && c.customerCode === customerCode,
            ) ?? null
          );
        }
        return store.customers.find((c) => matchesWhere(c, where)) ?? null;
      },
      findFirst: async ({ where, include }: { where: Row; include?: Row }) => {
        const found = store.customers.find((c) => matchesWhere(c, where));
        if (!found) return null;
        const out: Row = { ...found };
        if (include?.orders) {
          out.orders = applyOrderBy(
            store.orders.filter((o) => o.customerId === found.id),
            include.orders.orderBy,
          )
            .slice(0, include.orders.take ?? 25)
            .map((o) => ({ ...o, branch: store.branches.find((b) => b.id === o.branchId) }));
        }
        return out;
      },
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.customers.filter((c) => matchesWhere(c, where)),
          orderBy,
        ).map((c) => ({
          ...c,
          ...(include?._count
            ? { _count: { orders: store.orders.filter((o) => o.customerId === c.id).length } }
            : {}),
          ...(include?.orders
            ? {
                orders: applyOrderBy(
                  store.orders.filter((o) => o.customerId === c.id),
                  include.orders.orderBy,
                ).map((o) => ({
                  id: o.id,
                  totalAmount: o.totalAmount,
                  currencyCode: o.currencyCode,
                  status: o.status,
                  createdAt: o.createdAt,
                })),
              }
            : {}),
        })),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = { id: uuid(), status: 'ACTIVE', createdAt: now, updatedAt: now, ...data };
        store.customers.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.customers.findIndex((c) => matchesWhere(c, where));
        if (idx === -1) throw new Error('Customer not found');
        store.customers[idx] = { ...store.customers[idx], ...data, updatedAt: new Date() };
        return { ...store.customers[idx] };
      },
    },

    order: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.orders.filter((o) => matchesWhere(o, where)).length,
      findFirst: async ({ where, include }: { where: Row; include?: Row }) => {
        const found = store.orders.find((o) => matchesWhere(o, where));
        return found ? enrichOrder(found, include) : null;
      },
      findMany: async ({ where, include, orderBy, take }: { where?: Row; include?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.orders.filter((o) => matchesWhere(o, where)),
          orderBy,
        )
          .slice(0, take ?? 200)
          .map((o) => enrichOrder(o, include)),
      create: async ({ data, include }: { data: Row; include?: Row }) => {
        const now = new Date();
        const { orderItems, payments, ...scalars } = data;
        const row: Row = {
          id: uuid(),
          createdAt: now,
          updatedAt: now,
          ...scalars,
          subtotal: dec(scalars.subtotal),
          discountAmount: dec(scalars.discountAmount),
          taxAmount: dec(scalars.taxAmount),
          totalAmount: dec(scalars.totalAmount),
          paidAmount: dec(scalars.paidAmount),
          changeAmount: dec(scalars.changeAmount),
          exchangeRate: dec(scalars.exchangeRate),
        };
        store.orders.push(row);

        if (orderItems?.create) {
          for (const item of orderItems.create) {
            store.orderItems.push({
              id: uuid(),
              orderId: row.id,
              ...item,
              quantity: dec(item.quantity),
              unitPrice: dec(item.unitPrice),
              unitCostSnapshot: dec(item.unitCostSnapshot),
              discountAmount: dec(item.discountAmount),
              taxAmount: dec(item.taxAmount),
              lineTotal: dec(item.lineTotal),
            });
          }
        }
        if (payments?.create) {
          for (const pay of payments.create) {
            store.payments.push({
              id: uuid(),
              orderId: row.id,
              paidAt: now,
              createdAt: now,
              ...pay,
              amount: dec(pay.amount),
              exchangeRate: dec(pay.exchangeRate),
              amountInOrderCurrency: dec(pay.amountInOrderCurrency),
            });
          }
        }
        return enrichOrder(row, include);
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.orders.findIndex((o) => matchesWhere(o, where));
        if (idx === -1) throw new Error('Order not found');
        store.orders[idx] = { ...store.orders[idx], ...data, updatedAt: new Date() };
        return { ...store.orders[idx] };
      },
    },

    orderItem: {
      findMany: async ({ where, include }: { where?: Row; include?: Row } = {}) =>
        store.orderItems
          .filter((oi) => matchesWhere(oi, where))
          .map((oi) => ({
            ...oi,
            ...(include?.order ? { order: store.orders.find((o) => o.id === oi.orderId) ?? null } : {}),
          })),
    },

    payment: {
      findMany: async ({ where, include, orderBy, take }: { where?: Row; include?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.payments.filter((p) => matchesWhere(p, where)),
          orderBy,
        )
          .slice(0, take ?? 200)
          .map((p) => {
            const out: Row = { ...p };
            if (include?.order) {
              const order = store.orders.find((o) => o.id === p.orderId);
              out.order = order
                ? {
                    ...order,
                    branch: store.branches.find((b) => b.id === order.branchId) ?? null,
                    cashierEmployee:
                      store.employees.find((e) => e.id === order.cashierEmployeeId) ?? null,
                  }
                : null;
            }
            return out;
          }),
    },

    saleReturn: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.saleReturns.filter((sr) => matchesWhere(sr, where)).length,
      findFirst: async ({ where, include, select }: { where: Row; include?: Row; select?: Row }) => {
        const sr = store.saleReturns.find((r) => matchesWhere(r, where));
        if (!sr) return null;
        return {
          ...sr,
          ...(include?.branch || select?.branch ? { branch: store.branches.find((b) => b.id === sr.branchId) } : {}),
          ...(include?.order || select?.order
            ? {
                order: (() => {
                  const o = store.orders.find((ord) => ord.id === sr.orderId);
                  if (!o) return null;
                  return {
                    ...o,
                    customer: store.customers.find((c) => c.id === o.customerId) ?? null,
                  };
                })(),
              }
            : {}),
          ...(include?.employee || select?.employee ? { employee: store.employees.find((e) => e.id === sr.employeeId) } : {}),
          ...(include?.saleReturnItems || select?.saleReturnItems
            ? {
                saleReturnItems: store.saleReturnItems
                  .filter((sri) => sri.saleReturnId === sr.id)
                  .map((sri) => ({
                    ...sri,
                    product: store.products.find((p) => p.id === sri.productId) ?? null,
                  })),
              }
            : {}),
        };
      },
      findUnique: async ({ where, include, select }: { where: Row; include?: Row; select?: Row }) => {
        const sr = store.saleReturns.find((r) => matchesWhere(r, where));
        if (!sr) return null;
        return {
          ...sr,
          ...(include?.branch || select?.branch ? { branch: store.branches.find((b) => b.id === sr.branchId) } : {}),
          ...(include?.order || select?.order
            ? {
                order: (() => {
                  const o = store.orders.find((ord) => ord.id === sr.orderId);
                  if (!o) return null;
                  return {
                    ...o,
                    customer: store.customers.find((c) => c.id === o.customerId) ?? null,
                  };
                })(),
              }
            : {}),
          ...(include?.employee || select?.employee ? { employee: store.employees.find((e) => e.id === sr.employeeId) } : {}),
          ...(include?.saleReturnItems || select?.saleReturnItems
            ? {
                saleReturnItems: store.saleReturnItems
                  .filter((sri) => sri.saleReturnId === sr.id)
                  .map((sri) => ({
                    ...sri,
                    product: store.products.find((p) => p.id === sri.productId) ?? null,
                  })),
              }
            : {}),
        };
      },
      findMany: async ({ where, include, select, orderBy, take }: { where?: Row; include?: Row; select?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.saleReturns.filter((sr) => matchesWhere(sr, where)),
          orderBy,
        )
          .slice(0, take ?? 200)
          .map((sr) => ({
            ...sr,
            ...(include?.branch || select?.branch ? { branch: store.branches.find((b) => b.id === sr.branchId) } : {}),
            ...(include?.order || select?.order ? { order: store.orders.find((o) => o.id === sr.orderId) } : {}),
            ...(include?.employee || select?.employee ? { employee: store.employees.find((e) => e.id === sr.employeeId) } : {}),
            ...(include?.saleReturnItems || select?.saleReturnItems
              ? { saleReturnItems: store.saleReturnItems.filter((sri) => sri.saleReturnId === sr.id) }
              : {}),
          })),
      create: async ({ data, include }: { data: Row; include?: Row }) => {
        const now = new Date();
        const { saleReturnItems, ...scalars } = data;
        const row: Row = {
          id: uuid(),
          returnedAt: now,
          createdAt: now,
          ...scalars,
          subtotal: dec(scalars.subtotal),
          refundAmount: dec(scalars.refundAmount),
        };
        store.saleReturns.push(row);
        if (saleReturnItems?.create) {
          for (const item of saleReturnItems.create) {
            store.saleReturnItems.push({
              id: uuid(),
              saleReturnId: row.id,
              ...item,
              quantity: dec(item.quantity),
              unitPrice: dec(item.unitPrice),
              refundAmount: dec(item.refundAmount),
              restockQuantity: dec(item.restockQuantity),
            });
          }
        }
        return {
          ...row,
          ...(include?.saleReturnItems
            ? { saleReturnItems: store.saleReturnItems.filter((i) => i.saleReturnId === row.id) }
            : {}),
          ...(include?.order ? { order: store.orders.find((o) => o.id === row.orderId) } : {}),
        };
      },
    },

    purchase: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.purchases.filter((p) => matchesWhere(p, where)).length,
      findFirst: async ({ where, include }: { where: Row; include?: Row }) => {
        const found = store.purchases.find((p) => matchesWhere(p, where));
        return found ? enrichPurchase(found, include) : null;
      },
      findMany: async ({ where, include, orderBy, take }: { where?: Row; include?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.purchases.filter((p) => matchesWhere(p, where)),
          orderBy,
        )
          .slice(0, take ?? 200)
          .map((p) => enrichPurchase(p, include)),
      create: async ({ data, include }: { data: Row; include?: Row }) => {
        const now = new Date();
        const { purchaseItems, purchasePayments, ...scalars } = data;
        const row: Row = {
          id: uuid(),
          createdAt: now,
          updatedAt: now,
          ...scalars,
          subtotal: dec(scalars.subtotal),
          discountAmount: dec(scalars.discountAmount),
          taxAmount: dec(scalars.taxAmount),
          totalAmount: dec(scalars.totalAmount),
          paidAmount: dec(scalars.paidAmount),
          exchangeRate: dec(scalars.exchangeRate),
        };
        store.purchases.push(row);
        if (purchaseItems?.create) {
          for (const pi of purchaseItems.create) {
            store.purchaseItems.push({
              id: uuid(),
              purchaseId: row.id,
              ...pi,
              quantity: dec(pi.quantity),
              unitCost: dec(pi.unitCost),
              discountAmount: dec(pi.discountAmount),
              taxAmount: dec(pi.taxAmount),
              lineTotal: dec(pi.lineTotal),
            });
          }
        }
        if (purchasePayments?.create) {
          store.purchasePayments.push({
            id: uuid(),
            purchaseId: row.id,
            paidAt: now,
            createdAt: now,
            ...purchasePayments.create,
            amount: dec(purchasePayments.create.amount),
            exchangeRate: dec(purchasePayments.create.exchangeRate),
          });
        }
        return enrichPurchase(row, include);
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.purchases.findIndex((p) => matchesWhere(p, where));
        if (idx === -1) throw new Error('Purchase not found');
        const next = { ...store.purchases[idx], ...data, updatedAt: new Date() };
        if (data.paidAmount !== undefined) next.paidAmount = dec(data.paidAmount);
        store.purchases[idx] = next;
        return { ...next };
      },
    },

    purchasePayment: {
      findMany: async ({ where, include, orderBy, take }: { where?: Row; include?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.purchasePayments.filter((pp) => matchesWhere(pp, where)),
          orderBy,
        )
          .slice(0, take ?? 200)
          .map((pp) => {
            const out: Row = { ...pp };
            if (include?.purchase) {
              const purchase = store.purchases.find((p) => p.id === pp.purchaseId);
              out.purchase = purchase
                ? {
                    ...purchase,
                    branch: store.branches.find((b) => b.id === purchase.branchId) ?? null,
                    supplier: store.suppliers.find((s) => s.id === purchase.supplierId) ?? null,
                    employee: store.employees.find((e) => e.id === purchase.employeeId) ?? null,
                  }
                : null;
            }
            return out;
          }),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = {
          id: uuid(),
          paidAt: now,
          createdAt: now,
          ...data,
          amount: dec(data.amount),
          exchangeRate: dec(data.exchangeRate),
        };
        store.purchasePayments.push(row);
        return { ...row };
      },
    },

    stockBalance: {
      findUnique: async ({ where }: { where: Row }) => {
        if (where.tenantId_branchId_productId) {
          const { tenantId, branchId, productId } = where.tenantId_branchId_productId;
          return (
            store.stockBalances.find(
              (sb) => sb.tenantId === tenantId && sb.branchId === branchId && sb.productId === productId,
            ) ?? null
          );
        }
        return store.stockBalances.find((sb) => matchesWhere(sb, where)) ?? null;
      },
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.stockBalances.filter((sb) => matchesWhere(sb, where)),
          orderBy,
        ).map((sb) => {
          const out: Row = { ...sb };
          if (include?.branch) out.branch = store.branches.find((b) => b.id === sb.branchId) ?? null;
          if (include?.product) {
            const p = store.products.find((pr) => pr.id === sb.productId);
            out.product = p
              ? {
                  ...p,
                  unit: store.units.find((u) => u.id === p.unitId) ?? null,
                }
              : null;
          }
          return out;
        }),
      create: async ({ data }: { data: Row }) => {
        const row = {
          id: uuid(),
          updatedAt: new Date(),
          ...data,
          quantity: dec(data.quantity),
        };
        store.stockBalances.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.stockBalances.findIndex((sb) => matchesWhere(sb, where));
        if (idx === -1) throw new Error('StockBalance not found');
        store.stockBalances[idx] = {
          ...store.stockBalances[idx],
          ...data,
          quantity: data.quantity !== undefined ? dec(data.quantity) : store.stockBalances[idx].quantity,
          updatedAt: new Date(),
        };
        return { ...store.stockBalances[idx] };
      },
    },

    stockMovement: {
      findMany: async ({ where, include, orderBy, take }: { where?: Row; include?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.stockMovements.filter((sm) => matchesWhere(sm, where)),
          orderBy,
        )
          .slice(0, take ?? 200)
          .map((sm) => ({
            ...sm,
            ...(include?.branch ? { branch: store.branches.find((b) => b.id === sm.branchId) } : {}),
            ...(include?.product ? { product: store.products.find((p) => p.id === sm.productId) } : {}),
            ...(include?.employee ? { employee: store.employees.find((e) => e.id === sm.createdBy) } : {}),
          })),
      create: async ({ data }: { data: Row }) => {
        const row = {
          id: uuid(),
          createdAt: new Date(),
          ...data,
          quantityIn: dec(data.quantityIn),
          quantityOut: dec(data.quantityOut),
          balanceAfter: dec(data.balanceAfter),
        };
        store.stockMovements.push(row);
        return { ...row };
      },
    },

    stockAdjustment: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.stockAdjustments.filter((sa) => matchesWhere(sa, where)).length,
      findFirst: async ({ where, include }: { where: Row; include?: Row }) => {
        const found = store.stockAdjustments.find((sa) => matchesWhere(sa, where));
        if (!found) return null;
        return {
          ...found,
          ...(include?.branch ? { branch: store.branches.find((b) => b.id === found.branchId) } : {}),
          ...(include?.employee ? { employee: store.employees.find((e) => e.id === found.employeeId) } : {}),
          ...(include?.approver ? { approver: store.employees.find((e) => e.id === found.approvedBy) } : {}),
        };
      },
      findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
        const found = store.stockAdjustments.find((sa) => matchesWhere(sa, where));
        if (!found) return null;
        return {
          ...found,
          ...(include?.branch ? { branch: store.branches.find((b) => b.id === found.branchId) } : {}),
          ...(include?.employee ? { employee: store.employees.find((e) => e.id === found.employeeId) } : {}),
          ...(include?.approver ? { approver: store.employees.find((e) => e.id === found.approvedBy) } : {}),
        };
      },
      findMany: async ({ where, include, orderBy, take }: { where?: Row; include?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.stockAdjustments.filter((sa) => matchesWhere(sa, where)),
          orderBy,
        )
          .slice(0, take ?? 200)
          .map((sa) => ({
            ...sa,
            ...(include?.branch ? { branch: store.branches.find((b) => b.id === sa.branchId) } : {}),
            ...(include?.employee ? { employee: store.employees.find((e) => e.id === sa.employeeId) } : {}),
            ...(include?.approver ? { approver: store.employees.find((e) => e.id === sa.approvedBy) } : {}),
          })),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = { id: uuid(), adjustmentDate: now, createdAt: now, ...data };
        store.stockAdjustments.push(row);
        return { ...row };
      },
    },

    shift: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.shifts.filter((s) => matchesWhere(s, where)).length,
      findUnique: async ({ where }: { where: Row }) =>
        store.shifts.find((s) => matchesWhere(s, where)) ?? null,
      findFirst: async ({ where, include, orderBy }: { where: Row; include?: Row; orderBy?: any }) => {
        const matched = applyOrderBy(
          store.shifts.filter((s) => matchesWhere(s, where)),
          orderBy,
        );
        const found = matched[0];
        if (!found) return null;
        return {
          ...found,
          ...(include?.branch ? { branch: store.branches.find((b) => b.id === found.branchId) } : {}),
          ...(include?.employee ? { employee: store.employees.find((e) => e.id === found.employeeId) } : {}),
          ...(include?._count
            ? { _count: { orders: store.orders.filter((o) => o.shiftId === found.id).length } }
            : {}),
          ...(include?.orders
            ? {
                orders: applyOrderBy(
                  store.orders.filter((o) => o.shiftId === found.id),
                  include.orders.orderBy,
                )
                  .slice(0, include.orders.take ?? 50)
                  .map((o) => ({
                    ...o,
                    payments: store.payments.filter((p) => p.orderId === o.id),
                  })),
              }
            : {}),
        };
      },
      findMany: async ({ where, include, orderBy, take }: { where?: Row; include?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.shifts.filter((s) => matchesWhere(s, where)),
          orderBy,
        )
          .slice(0, take ?? 100)
          .map((s) => ({
            ...s,
            ...(include?.branch ? { branch: store.branches.find((b) => b.id === s.branchId) } : {}),
            ...(include?.employee ? { employee: store.employees.find((e) => e.id === s.employeeId) } : {}),
            ...(include?._count
              ? { _count: { orders: store.orders.filter((o) => o.shiftId === s.id).length } }
              : {}),
          })),
      create: async ({ data, include }: { data: Row; include?: Row }) => {
        const now = new Date();
        const row = {
          id: uuid(),
          openedAt: now,
          closedAt: null,
          actualCash: null,
          cashDifference: null,
          createdAt: now,
          updatedAt: now,
          ...data,
          openingCash: dec(data.openingCash),
          expectedCash: dec(data.expectedCash),
        };
        store.shifts.push(row);
        return {
          ...row,
          ...(include?.branch ? { branch: store.branches.find((b) => b.id === row.branchId) } : {}),
          ...(include?.employee ? { employee: store.employees.find((e) => e.id === row.employeeId) } : {}),
        };
      },
      update: async ({ where, data, include }: { where: Row; data: Row; include?: Row }) => {
        const idx = store.shifts.findIndex((s) => matchesWhere(s, where));
        if (idx === -1) throw new Error('Shift not found');
        const next = { ...store.shifts[idx], ...data, updatedAt: new Date() };
        if (data.expectedCash !== undefined) next.expectedCash = dec(data.expectedCash);
        if (data.actualCash !== undefined) next.actualCash = dec(data.actualCash);
        if (data.cashDifference !== undefined) next.cashDifference = dec(data.cashDifference);
        store.shifts[idx] = next;
        return {
          ...next,
          ...(include?.branch ? { branch: store.branches.find((b) => b.id === next.branchId) } : {}),
          ...(include?.employee ? { employee: store.employees.find((e) => e.id === next.employeeId) } : {}),
        };
      },
    },

    expenseType: {
      findUnique: async ({ where }: { where: Row }) => {
        if (where.tenantId_name) {
          const { tenantId, name } = where.tenantId_name;
          return (
            store.expenseTypes.find((et) => et.tenantId === tenantId && et.name === name) ?? null
          );
        }
        return store.expenseTypes.find((et) => matchesWhere(et, where)) ?? null;
      },
      findFirst: async ({ where }: { where: Row }) =>
        store.expenseTypes.find((et) => matchesWhere(et, where)) ?? null,
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) =>
        applyOrderBy(
          store.expenseTypes.filter((et) => matchesWhere(et, where)),
          orderBy,
        ).map((et) => ({
          ...et,
          ...(include?._count
            ? { _count: { expenses: store.expenses.filter((ex) => ex.expenseTypeId === et.id).length } }
            : {}),
        })),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = { id: uuid(), status: 'ACTIVE', createdAt: now, updatedAt: now, ...data };
        store.expenseTypes.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.expenseTypes.findIndex((et) => matchesWhere(et, where));
        if (idx === -1) throw new Error('ExpenseType not found');
        store.expenseTypes[idx] = { ...store.expenseTypes[idx], ...data, updatedAt: new Date() };
        return { ...store.expenseTypes[idx] };
      },
    },

    expense: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.expenses.filter((ex) => matchesWhere(ex, where)).length,
      findMany: async ({ where, include, orderBy, take }: { where?: Row; include?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.expenses.filter((ex) => matchesWhere(ex, where)),
          orderBy,
        )
          .slice(0, take ?? 200)
          .map((ex) => ({
            ...ex,
            ...(include?.branch ? { branch: store.branches.find((b) => b.id === ex.branchId) } : {}),
            ...(include?.expenseType
              ? { expenseType: store.expenseTypes.find((et) => et.id === ex.expenseTypeId) }
              : {}),
            ...(include?.employee ? { employee: store.employees.find((e) => e.id === ex.employeeId) } : {}),
          })),
      create: async ({ data, include }: { data: Row; include?: Row }) => {
        const now = new Date();
        const row = {
          id: uuid(),
          createdAt: now,
          updatedAt: now,
          ...data,
          amount: dec(data.amount),
          exchangeRate: dec(data.exchangeRate),
        };
        store.expenses.push(row);
        return {
          ...row,
          ...(include?.branch ? { branch: store.branches.find((b) => b.id === row.branchId) } : {}),
          ...(include?.expenseType
            ? { expenseType: store.expenseTypes.find((et) => et.id === row.expenseTypeId) }
            : {}),
          ...(include?.employee ? { employee: store.employees.find((e) => e.id === row.employeeId) } : {}),
        };
      },
    },

    income: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.incomes.filter((i) => matchesWhere(i, where)).length,
      findMany: async ({ where, include, orderBy, take }: { where?: Row; include?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.incomes.filter((i) => matchesWhere(i, where)),
          orderBy,
        )
          .slice(0, take ?? 200)
          .map((inc) => ({
            ...inc,
            ...(include?.branch ? { branch: store.branches.find((b) => b.id === inc.branchId) } : {}),
            ...(include?.employee ? { employee: store.employees.find((e) => e.id === inc.employeeId) } : {}),
          })),
      create: async ({ data, include }: { data: Row; include?: Row }) => {
        const now = new Date();
        const row = {
          id: uuid(),
          createdAt: now,
          updatedAt: now,
          ...data,
          amount: dec(data.amount),
          exchangeRate: dec(data.exchangeRate),
        };
        store.incomes.push(row);
        return {
          ...row,
          ...(include?.branch ? { branch: store.branches.find((b) => b.id === row.branchId) } : {}),
          ...(include?.employee ? { employee: store.employees.find((e) => e.id === row.employeeId) } : {}),
        };
      },
    },

    setting: {
      findFirst: async ({ where }: { where: Row }) =>
        store.settings.find((s) => matchesWhere(s, where)) ?? null,
      findMany: async ({ where }: { where?: Row } = {}) =>
        store.settings.filter((s) => matchesWhere(s, where)),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = { id: uuid(), createdAt: now, updatedAt: now, ...data };
        store.settings.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.settings.findIndex((s) => matchesWhere(s, where));
        if (idx === -1) throw new Error('Setting not found');
        store.settings[idx] = { ...store.settings[idx], ...data, updatedAt: new Date() };
        return { ...store.settings[idx] };
      },
    },

    exchangeRate: {
      findFirst: async ({ where, orderBy }: { where: Row; orderBy?: any }) => {
        const matched = applyOrderBy(
          store.exchangeRates.filter((er) => matchesWhere(er, where)),
          orderBy,
        );
        return matched[0] ? { ...matched[0] } : null;
      },
      findMany: async ({ where, orderBy, take }: { where?: Row; orderBy?: any; take?: number } = {}) =>
        applyOrderBy(
          store.exchangeRates.filter((er) => matchesWhere(er, where)),
          orderBy,
        ).slice(0, take ?? 50),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = {
          id: uuid(),
          effectiveAt: now,
          createdAt: now,
          ...data,
          rate: dec(data.rate),
        };
        store.exchangeRates.push(row);
        return { ...row };
      },
    },

    userSession: {
      findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
        const found = store.userSessions.find((s) => matchesWhere(s, where));
        if (!found) return null;
        const out: Row = { ...found };
        if (include?.user) {
          out.user = store.users.find((u) => u.id === found.userId) ?? null;
        }
        return out;
      },
      findMany: async ({ where }: { where?: Row } = {}) =>
        store.userSessions
          .filter((s) => matchesWhere(s, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((s) => ({ ...s })),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = {
          id: uuid(),
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        store.userSessions.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.userSessions.findIndex((s) => matchesWhere(s, where));
        if (idx === -1) throw new Error('Session not found');
        store.userSessions[idx] = {
          ...store.userSessions[idx],
          ...data,
          updatedAt: new Date(),
        };
        return { ...store.userSessions[idx] };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (let i = 0; i < store.userSessions.length; i += 1) {
          if (matchesWhere(store.userSessions[i], where)) {
            store.userSessions[i] = {
              ...store.userSessions[i],
              ...data,
              updatedAt: new Date(),
            };
            count += 1;
          }
        }
        return { count };
      },
    },

    passwordResetToken: {
      findUnique: async ({ where }: { where: Row }) => {
        const found = store.passwordResetTokens.find((t) => matchesWhere(t, where));
        return found ? { ...found } : null;
      },
      create: async ({ data }: { data: Row }) => {
        const row = { id: uuid(), usedAt: null, createdAt: new Date(), ...data };
        store.passwordResetTokens.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const idx = store.passwordResetTokens.findIndex((t) => matchesWhere(t, where));
        if (idx === -1) throw new Error('Reset token not found');
        store.passwordResetTokens[idx] = { ...store.passwordResetTokens[idx], ...data };
        return { ...store.passwordResetTokens[idx] };
      },
    },

    activityLog: {
      findMany: async ({
        where,
        take = 50,
        skip = 0,
      }: { where?: Row; take?: number; skip?: number } = {}) =>
        store.activityLogs
          .filter((l) => matchesWhere(l, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take)
          .map((l) => ({
            ...l,
            user: store.users.find((u) => u.id === l.userId) ?? null,
            employee: store.employees.find((e) => e.id === l.employeeId) ?? null,
          })),
      count: async ({ where }: { where?: Row } = {}) =>
        store.activityLogs.filter((l) => matchesWhere(l, where)).length,
      create: async ({ data }: { data: Row }) => {
        const row = { id: uuid(), createdAt: new Date(), ...data };
        store.activityLogs.push(row);
        return { ...row };
      },
    },

    stockTransfer: {
      findMany: async ({
        where,
        include,
        orderBy,
        take = 50,
        skip = 0,
      }: { where?: Row; include?: Row; orderBy?: any; take?: number; skip?: number } = {}) => {
        let results = store.stockTransfers.filter((t) => matchesWhere(t, where));
        if (orderBy?.createdAt === 'desc') {
          results = results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return results.slice(skip, skip + take).map((t) => {
          const out: Row = { ...t };
          if (include?.fromBranch) {
            out.fromBranch = store.branches.find((b) => b.id === t.fromBranchId) ?? null;
          }
          if (include?.toBranch) {
            out.toBranch = store.branches.find((b) => b.id === t.toBranchId) ?? null;
          }
          if (include?.employee) {
            out.employee = store.employees.find((e) => e.id === t.createdBy) ?? null;
          }
          if (include?.items) {
            out.items = store.stockTransferItems
              .filter((ti) => ti.transferId === t.id)
              .map((ti) => ({
                ...ti,
                product: store.products.find((p) => p.id === ti.productId) ?? null,
              }));
          }
          return out;
        });
      },
      count: async ({ where }: { where?: Row } = {}) =>
        store.stockTransfers.filter((t) => matchesWhere(t, where)).length,
      findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
        const t = store.stockTransfers.find((tr) => matchesWhere(tr, where));
        if (!t) return null;
        const out: Row = { ...t };
        if (include?.fromBranch) {
          out.fromBranch = store.branches.find((b) => b.id === t.fromBranchId) ?? null;
        }
        if (include?.toBranch) {
          out.toBranch = store.branches.find((b) => b.id === t.toBranchId) ?? null;
        }
        if (include?.employee) {
          out.employee = store.employees.find((e) => e.id === t.createdBy) ?? null;
        }
        if (include?.items) {
          out.items = store.stockTransferItems
            .filter((ti) => ti.transferId === t.id)
            .map((ti) => ({
              ...ti,
              product: store.products.find((p) => p.id === ti.productId) ?? null,
            }));
        }
        return out;
      },
      create: async ({ data, include }: { data: Row; include?: Row }) => {
        const { items, ...scalars } = data;
        const now = new Date();
        const row = {
          id: uuid(),
          status: 'PENDING',
          transferDate: now,
          createdAt: now,
          updatedAt: now,
          ...scalars,
        };
        store.stockTransfers.push(row);
        if (items?.create) {
          for (const it of items.create) {
            store.stockTransferItems.push({
              id: uuid(),
              transferId: row.id,
              ...it,
              quantity: dec(it.quantity),
            });
          }
        }
        const out: Row = { ...row };
        if (include?.fromBranch) {
          out.fromBranch = store.branches.find((b) => b.id === row.fromBranchId) ?? null;
        }
        if (include?.toBranch) {
          out.toBranch = store.branches.find((b) => b.id === row.toBranchId) ?? null;
        }
        if (include?.items) {
          out.items = store.stockTransferItems
            .filter((ti) => ti.transferId === row.id)
            .map((ti) => ({
              ...ti,
              product: store.products.find((p) => p.id === ti.productId) ?? null,
            }));
        }
        return out;
      },
      update: async ({ where, data, include }: { where: Row; data: Row; include?: Row }) => {
        const idx = store.stockTransfers.findIndex((t) => matchesWhere(t, where));
        if (idx === -1) throw new Error('Stock transfer not found');
        store.stockTransfers[idx] = {
          ...store.stockTransfers[idx],
          ...data,
          updatedAt: new Date(),
        };
        const out: Row = { ...store.stockTransfers[idx] };
        if (include?.fromBranch) {
          out.fromBranch = store.branches.find((b) => b.id === out.fromBranchId) ?? null;
        }
        if (include?.toBranch) {
          out.toBranch = store.branches.find((b) => b.id === out.toBranchId) ?? null;
        }
        if (include?.items) {
          out.items = store.stockTransferItems
            .filter((ti) => ti.transferId === out.id)
            .map((ti) => ({
              ...ti,
              product: store.products.find((p) => p.id === ti.productId) ?? null,
            }));
        }
        return out;
      },
    },

    stockTransferItem: {
      findMany: async ({ where, include }: { where?: Row; include?: Row } = {}) =>
        store.stockTransferItems
          .filter((ti) => matchesWhere(ti, where))
          .map((ti) => {
            const out: Row = { ...ti };
            if (include?.product) {
              out.product = store.products.find((p) => p.id === ti.productId) ?? null;
            }
            return out;
          }),
      create: async ({ data }: { data: Row }) => {
        const row = { id: uuid(), ...data, quantity: dec(data.quantity) };
        store.stockTransferItems.push(row);
        return { ...row };
      },
    },

    subscriptionPlan: {
      findMany: async () => [...store.subscriptionPlans],
      findUnique: async ({ where }: { where: Row }) => {
        const found = store.subscriptionPlans.find((p) => matchesWhere(p, where));
        return found ? { ...found } : null;
      },
      create: async ({ data }: { data: Row }) => {
        const row = {
          id: uuid(),
          monthlyPrice: dec(data.monthlyPrice ?? 0),
          yearlyPrice: dec(data.yearlyPrice ?? 0),
          createdAt: new Date(),
          ...data,
        };
        store.subscriptionPlans.push(row);
        return { ...row };
      },
    },

    tenantSubscription: {
      findMany: async ({ where, include, orderBy }: { where?: Row; include?: Row; orderBy?: any } = {}) => {
        let list = store.tenantSubscriptions.filter((s) => matchesWhere(s, where));
        return applyOrderBy(list, orderBy).map((s) => {
          const out = { ...s };
          if (include?.plan) {
            out.plan = store.subscriptionPlans.find((p) => p.id === s.planId) ?? null;
          }
          if (include?.tenant) {
            out.tenant = store.tenants.find((t) => t.id === s.tenantId) ?? null;
          }
          return out;
        });
      },
      findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
        const found = store.tenantSubscriptions.find((s) => matchesWhere(s, where));
        if (!found) return null;
        const out: Row = { ...found };
        if (include?.plan) {
          out.plan = store.subscriptionPlans.find((p) => p.id === found.planId) ?? null;
        }
        if (include?.invoices) {
          out.invoices = store.subscriptionInvoices.filter((i) => i.subscriptionId === found.id);
        }
        return out;
      },
      create: async ({ data, include }: { data: Row; include?: Row }) => {
        const now = new Date();
        const row = {
          id: uuid(),
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        store.tenantSubscriptions.push(row);
        const out: Row = { ...row };
        if (include?.plan) {
          out.plan = store.subscriptionPlans.find((p) => p.id === row.planId) ?? null;
        }
        return out;
      },
      update: async ({ where, data, include }: { where: Row; data: Row; include?: Row }) => {
        const idx = store.tenantSubscriptions.findIndex((s) => matchesWhere(s, where));
        if (idx === -1) throw new Error('Tenant subscription not found');
        store.tenantSubscriptions[idx] = {
          ...store.tenantSubscriptions[idx],
          ...data,
          updatedAt: new Date(),
        };
        const out: Row = { ...store.tenantSubscriptions[idx] };
        if (include?.plan) {
          out.plan = store.subscriptionPlans.find((p) => p.id === out.planId) ?? null;
        }
        return out;
      },
      upsert: async ({ where, update, create, include }: { where: Row; update: Row; create: Row; include?: Row }) => {
        const idx = store.tenantSubscriptions.findIndex((s) => matchesWhere(s, where));
        const now = new Date();
        if (idx >= 0) {
          store.tenantSubscriptions[idx] = {
            ...store.tenantSubscriptions[idx],
            ...update,
            updatedAt: now,
          };
          const out: Row = { ...store.tenantSubscriptions[idx] };
          if (include?.plan) out.plan = store.subscriptionPlans.find((p) => p.id === out.planId) ?? null;
          return out;
        }
        const row = {
          id: uuid(),
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        store.tenantSubscriptions.push(row);
        const out: Row = { ...row };
        if (include?.plan) out.plan = store.subscriptionPlans.find((p) => p.id === row.planId) ?? null;
        return out;
      },
    },

    subscriptionInvoice: {
      findMany: async ({ where, orderBy }: { where?: Row; orderBy?: any } = {}) => {
        let results = store.subscriptionInvoices.filter((i) => matchesWhere(i, where));
        if (orderBy?.createdAt === 'desc') {
          results = results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return results;
      },
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = {
          id: uuid(),
          amount: dec(data.amount),
          status: 'PAID',
          paidAt: now,
          createdAt: now,
          ...data,
        };
        store.subscriptionInvoices.push(row);
        return { ...row };
      },
    },

    paymentWebhookLog: {
      findMany: async ({ where }: { where?: Row } = {}) =>
        store.paymentWebhookLogs.filter((w) => matchesWhere(w, where)),
      create: async ({ data }: { data: Row }) => {
        const row = { id: uuid(), receivedAt: new Date(), ...data };
        store.paymentWebhookLogs.push(row);
        return { ...row };
      },
    },
  };

  return client;
}
