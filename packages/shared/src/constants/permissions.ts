export type PermissionAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'archive'
  | 'refund'
  | 'adjust'
  | 'discount'
  | 'manage'
  | 'pay'
  | 'deactivate';

export interface PermissionDefinition {
  code: string;
  module: string;
  action: PermissionAction | string;
  description: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Tenants & Branches
  { code: 'tenant.view', module: 'settings', action: 'view', description: 'View business profile and settings' },
  { code: 'tenant.update', module: 'settings', action: 'update', description: 'Update business profile and settings' },
  { code: 'branches.view', module: 'branches', action: 'view', description: 'View business branches' },
  { code: 'branches.create', module: 'branches', action: 'create', description: 'Create new branches' },
  { code: 'branches.update', module: 'branches', action: 'update', description: 'Update existing branches' },
  { code: 'branches.delete', module: 'branches', action: 'delete', description: 'Archive or deactivate branches' },

  // Employees & Access Control
  { code: 'employees.view', module: 'employees', action: 'view', description: 'View employees' },
  { code: 'employees.create', module: 'employees', action: 'create', description: 'Create or invite employees' },
  { code: 'employees.update', module: 'employees', action: 'update', description: 'Update employees and branch assignments' },
  { code: 'employees.deactivate', module: 'employees', action: 'deactivate', description: 'Activate or deactivate employees' },
  { code: 'roles.view', module: 'roles', action: 'view', description: 'View roles and permissions' },
  { code: 'roles.manage', module: 'roles', action: 'manage', description: 'Create, update, and delete custom roles' },

  // Products & Catalog
  { code: 'products.view', module: 'products', action: 'view', description: 'View products, categories, units, and suppliers' },
  { code: 'products.create', module: 'products', action: 'create', description: 'Create products, categories, units, and suppliers' },
  { code: 'products.update', module: 'products', action: 'update', description: 'Update products and pricing' },
  { code: 'products.archive', module: 'products', action: 'archive', description: 'Archive products' },
  { code: 'products.delete', module: 'products', action: 'delete', description: 'Delete catalog items or products' },

  // Customers
  { code: 'customers.view', module: 'customers', action: 'view', description: 'View customers and purchase history' },
  { code: 'customers.manage', module: 'customers', action: 'manage', description: 'Create and update customers' },

  // Sales & POS
  { code: 'sales.view', module: 'sales', action: 'view', description: 'View orders and payment history' },
  { code: 'sales.create', module: 'sales', action: 'create', description: 'Process POS sales and accept payments' },
  { code: 'sales.discount', module: 'sales', action: 'discount', description: 'Apply discounts on sales' },
  { code: 'sales.refund', module: 'sales', action: 'refund', description: 'Process sales returns and refunds' },

  // Purchasing
  { code: 'purchases.view', module: 'purchases', action: 'view', description: 'View purchase orders and supplier payments' },
  { code: 'purchases.create', module: 'purchases', action: 'create', description: 'Create and receive purchases' },
  { code: 'purchases.pay', module: 'purchases', action: 'pay', description: 'Record supplier payments' },

  // Inventory
  { code: 'inventory.view', module: 'inventory', action: 'view', description: 'View stock balances and movement history' },
  { code: 'inventory.adjust', module: 'inventory', action: 'adjust', description: 'Create and approve stock adjustments' },

  // Shifts & Cash
  { code: 'shifts.view', module: 'shifts', action: 'view', description: 'View cashier shifts and history' },
  { code: 'shifts.manage', module: 'shifts', action: 'manage', description: 'Open and close cashier shifts' },

  // Finance
  { code: 'finance.view', module: 'finance', action: 'view', description: 'View expenses and additional income' },
  { code: 'finance.manage', module: 'finance', action: 'manage', description: 'Record expenses, expense types, and additional income' },

  // Reports & Audit
  { code: 'reports.view', module: 'reports', action: 'view', description: 'View sales, inventory, profit, and shift reports' },
  { code: 'activity_logs.view', module: 'activity_logs', action: 'view', description: 'View tenant audit and activity logs' },
];

export const ALL_PERMISSION_CODES = PERMISSION_DEFINITIONS.map((p) => p.code);

export const ALL_PERMISSION_ACTIONS = Array.from(
  new Set(PERMISSION_DEFINITIONS.map((p) => p.action)),
);

/**
 * Splits an action-based permission code (e.g. "sales.create", "inventory.adjust")
 * into its constituent module and action parts.
 */
export function parsePermissionCode(code: string): { module: string; action: string } {
  const dotIndex = code.indexOf('.');
  if (dotIndex > 0) {
    return {
      module: code.slice(0, dotIndex),
      action: code.slice(dotIndex + 1),
    };
  }
  return { module: code, action: 'access' };
}

export function getPermissionModule(code: string): string {
  return parsePermissionCode(code).module;
}

export function getPermissionAction(code: string): string {
  return parsePermissionCode(code).action;
}

export function formatPermissionCode(module: string, action: string): string {
  return `${module.trim().toLowerCase()}.${action.trim().toLowerCase()}`;
}

export const BUSINESS_TYPES = [
  'RETAIL',
  'CAFE_RESTAURANT',
  'MINIMART',
  'PHARMACY',
  'ELECTRONICS',
  'WHOLESALE',
  'FASHION',
  'SERVICES',
  'OTHER',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
