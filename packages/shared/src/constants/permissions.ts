export interface PermissionDefinition {
  code: string;
  module: string;
  description: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Tenants & Branches
  { code: 'tenant.view', module: 'settings', description: 'View business profile and settings' },
  { code: 'tenant.update', module: 'settings', description: 'Update business profile and settings' },
  { code: 'branches.view', module: 'branches', description: 'View business branches' },
  { code: 'branches.create', module: 'branches', description: 'Create new branches' },
  { code: 'branches.update', module: 'branches', description: 'Update existing branches' },
  { code: 'branches.delete', module: 'branches', description: 'Archive or deactivate branches' },

  // Employees & Access Control
  { code: 'employees.view', module: 'employees', description: 'View employees' },
  { code: 'employees.create', module: 'employees', description: 'Create or invite employees' },
  { code: 'employees.update', module: 'employees', description: 'Update employees and branch assignments' },
  { code: 'employees.deactivate', module: 'employees', description: 'Activate or deactivate employees' },
  { code: 'roles.view', module: 'roles', description: 'View roles and permissions' },
  { code: 'roles.manage', module: 'roles', description: 'Create, update, and delete custom roles' },

  // Products & Catalog
  { code: 'products.view', module: 'products', description: 'View products, categories, units, and suppliers' },
  { code: 'products.create', module: 'products', description: 'Create products, categories, units, and suppliers' },
  { code: 'products.update', module: 'products', description: 'Update products and pricing' },
  { code: 'products.archive', module: 'products', description: 'Archive products' },

  // Customers
  { code: 'customers.view', module: 'customers', description: 'View customers and purchase history' },
  { code: 'customers.manage', module: 'customers', description: 'Create and update customers' },

  // Sales & POS
  { code: 'sales.view', module: 'sales', description: 'View orders and payment history' },
  { code: 'sales.create', module: 'sales', description: 'Process POS sales and accept payments' },
  { code: 'sales.discount', module: 'sales', description: 'Apply discounts on sales' },
  { code: 'sales.refund', module: 'sales', description: 'Process sales returns and refunds' },

  // Purchasing
  { code: 'purchases.view', module: 'purchases', description: 'View purchase orders and supplier payments' },
  { code: 'purchases.create', module: 'purchases', description: 'Create and receive purchases' },
  { code: 'purchases.pay', module: 'purchases', description: 'Record supplier payments' },

  // Inventory
  { code: 'inventory.view', module: 'inventory', description: 'View stock balances and movement history' },
  { code: 'inventory.adjust', module: 'inventory', description: 'Create and approve stock adjustments' },

  // Shifts & Cash
  { code: 'shifts.view', module: 'shifts', description: 'View cashier shifts and history' },
  { code: 'shifts.manage', module: 'shifts', description: 'Open and close cashier shifts' },

  // Finance
  { code: 'finance.view', module: 'finance', description: 'View expenses and additional income' },
  { code: 'finance.manage', module: 'finance', description: 'Record expenses, expense types, and additional income' },

  // Reports & Audit
  { code: 'reports.view', module: 'reports', description: 'View sales, inventory, profit, and shift reports' },
  { code: 'activity_logs.view', module: 'activity_logs', description: 'View tenant audit and activity logs' },
];

export const ALL_PERMISSION_CODES = PERMISSION_DEFINITIONS.map((p) => p.code);

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

