import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import * as billingController from './billing.controller';

export const billingRouter = Router();

// Public/tenant plan catalog
billingRouter.get('/plans', billingController.getSubscriptionPlansHandler);

// Tenant-scoped billing operations
billingRouter.use(authenticate, requireTenantContext);

billingRouter.get(
  '/subscription',
  requirePermission('tenant.view'),
  billingController.getTenantSubscriptionHandler,
);

billingRouter.post(
  '/subscription/change',
  requirePermission('tenant.update'),
  billingController.changeSubscriptionPlanHandler,
);
