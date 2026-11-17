import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler';
import { env } from './config/env';

// Composite / Umbrella Routers (Backward Compatibility)
import { accessRouter } from './modules/access/access.routes';
import { authRouter } from './modules/auth/auth.routes';
import { billingRouter } from './modules/billing/billing.routes';
import { financeRouter } from './modules/finance/finance.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { platformRouter } from './modules/platform/platform.routes';
import { purchasingRouter } from './modules/purchasing/purchasing.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { returnsRouter } from './modules/sales/sales.routes';
import { transfersRouter } from './modules/transfers/transfers.routes';

// Dedicated Feature Routers (One File / Feature Architecture)
import { activityLogsRouter } from './modules/activity-logs/activity-logs.routes';
import { branchesRouter } from './modules/branches/branches.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { employeeBranchAccessRouter } from './modules/employee-branch-access/employee-branch-access.routes';
import { employeesRouter } from './modules/employees/employees.routes';
import { exchangeRatesRouter } from './modules/exchange-rates/exchange-rates.routes';
import { expenseTypesRouter } from './modules/expense-types/expense-types.routes';
import { expensesRouter } from './modules/expenses/expenses.routes';
import { incomesRouter } from './modules/incomes/incomes.routes';
import { movementTypesRouter } from './modules/movement-types/movement-types.routes';
import { orderItemsRouter } from './modules/order-items/order-items.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { paymentIntegrationsRouter } from './modules/payments/payment-integrations.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { permissionsRouter } from './modules/permissions/permissions.routes';
import { productsRouter } from './modules/products/products.routes';
import { purchaseItemsRouter } from './modules/purchase-items/purchase-items.routes';
import { purchasePaymentsRouter } from './modules/purchase-payments/purchase-payments.routes';
import { purchasesRouter } from './modules/purchases/purchases.routes';
import { rolePermissionsRouter } from './modules/role-permissions/role-permissions.routes';
import { rolesRouter } from './modules/roles/roles.routes';
import { saleReturnItemsRouter } from './modules/sale-return-items/sale-return-items.routes';
import { saleReturnsRouter } from './modules/sale-returns/sale-returns.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { shiftsRouter } from './modules/shifts/shifts.routes';
import { stockAdjustmentsRouter } from './modules/stock-adjustments/stock-adjustments.routes';
import { stockBalancesRouter } from './modules/stock-balances/stock-balances.routes';
import { stockMovementsRouter } from './modules/stock-movements/stock-movements.routes';
import { suppliersRouter } from './modules/suppliers/suppliers.routes';
import { tenantUsersRouter } from './modules/tenant-users/tenant-users.routes';
import { tenantsRouter } from './modules/tenants/tenants.routes';
import { unitsRouter } from './modules/units/units.routes';
import { userRolesRouter } from './modules/user-roles/user-roles.routes';
import { usersRouter } from './modules/users/users.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.NODE_ENV === 'test' ? 1000 : 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
      },
    },
  });

  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      service: 'cambodia-pos-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Authentication & System
  app.use('/api/v1/auth', authLimiter, authRouter);

  // Core Multi-Tenancy & Org
  app.use('/api/v1/tenants', tenantsRouter);
  app.use('/api/v1/branches', branchesRouter);

  // Access & RBAC Features
  app.use('/api/v1/access', accessRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/tenant-users', tenantUsersRouter);
  app.use('/api/v1/employees', employeesRouter);
  app.use('/api/v1/roles', rolesRouter);
  app.use('/api/v1/permissions', permissionsRouter);
  app.use('/api/v1/role-permissions', rolePermissionsRouter);
  app.use('/api/v1/user-roles', userRolesRouter);
  app.use('/api/v1/employee-branch-access', employeeBranchAccessRouter);

  // Catalog Features
  app.use('/api/v1/categories', categoriesRouter);
  app.use('/api/v1/units', unitsRouter);
  app.use('/api/v1/suppliers', suppliersRouter);
  app.use('/api/v1/products', productsRouter);

  // Customer Management
  app.use('/api/v1/customers', customersRouter);

  // Sales & POS Features
  app.use('/api/v1/orders', ordersRouter);
  app.use('/api/v1/order-items', orderItemsRouter);
  app.use('/api/v1/payments', paymentIntegrationsRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/returns', returnsRouter);
  app.use('/api/v1/sale-returns', saleReturnsRouter);
  app.use('/api/v1/sale-return-items', saleReturnItemsRouter);

  // Purchasing & Suppliers
  app.use('/api/v1/purchases', purchasesRouter);
  app.use('/api/v1/purchases', purchasingRouter);
  app.use('/api/v1/purchase-items', purchaseItemsRouter);
  app.use('/api/v1/purchase-payments', purchasePaymentsRouter);

  // Inventory & Stock Management
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/stock-balances', stockBalancesRouter);
  app.use('/api/v1/stock-movements', stockMovementsRouter);
  app.use('/api/v1/movement-types', movementTypesRouter);
  app.use('/api/v1/stock-adjustments', stockAdjustmentsRouter);
  app.use('/api/v1/transfers', transfersRouter);

  // Cash, Shifts & Finance
  app.use('/api/v1/shifts', shiftsRouter);
  app.use('/api/v1/finance', financeRouter);
  app.use('/api/v1/expense-types', expenseTypesRouter);
  app.use('/api/v1/expenses', expensesRouter);
  app.use('/api/v1/incomes', incomesRouter);

  // Platform & Configuration
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/billing', billingRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1/exchange-rates', exchangeRatesRouter);
  app.use('/api/v1/activity-logs', activityLogsRouter);
  app.use('/api/v1/platform', platformRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
