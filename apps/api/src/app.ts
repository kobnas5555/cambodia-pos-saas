import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler';
import { env } from './config/env';
import { accessRouter } from './modules/access/access.routes';
import { activityLogsRouter } from './modules/activity-logs/activity-logs.routes';
import { authRouter } from './modules/auth/auth.routes';
import { branchesRouter } from './modules/branches/branches.routes';
import {
  categoriesRouter,
  productsRouter,
  suppliersRouter,
  unitsRouter,
} from './modules/catalog/catalog.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { financeRouter } from './modules/finance/finance.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { platformRouter } from './modules/platform/platform.routes';
import { purchasingRouter } from './modules/purchasing/purchasing.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { ordersRouter, paymentsRouter, returnsRouter } from './modules/sales/sales.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { shiftsRouter } from './modules/shifts/shifts.routes';
import { tenantsRouter } from './modules/tenants/tenants.routes';
import { transfersRouter } from './modules/transfers/transfers.routes';
import { billingRouter } from './modules/billing/billing.routes';
import { paymentIntegrationsRouter } from './modules/payments/payment-integrations.routes';

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

  app.use('/api/v1/auth', authLimiter, authRouter);
  app.use('/api/v1/tenants', tenantsRouter);
  app.use('/api/v1/branches', branchesRouter);
  app.use('/api/v1/access', accessRouter);
  app.use('/api/v1/categories', categoriesRouter);
  app.use('/api/v1/units', unitsRouter);
  app.use('/api/v1/suppliers', suppliersRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/customers', customersRouter);
  app.use('/api/v1/orders', ordersRouter);
  app.use('/api/v1/payments', paymentIntegrationsRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/returns', returnsRouter);
  app.use('/api/v1/purchases', purchasingRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/transfers', transfersRouter);
  app.use('/api/v1/shifts', shiftsRouter);
  app.use('/api/v1/finance', financeRouter);
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/billing', billingRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1/activity-logs', activityLogsRouter);
  app.use('/api/v1/platform', platformRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
