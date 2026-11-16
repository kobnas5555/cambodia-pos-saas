import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import * as paymentIntegrationsController from './payment-integrations.controller';

export const paymentIntegrationsRouter = Router();

// Public webhook endpoints (called by Bakong / ABA servers)
paymentIntegrationsRouter.post('/webhooks/bakong', paymentIntegrationsController.bakongWebhookHandler);
paymentIntegrationsRouter.post('/webhooks/payway', paymentIntegrationsController.paywayWebhookHandler);

// Dynamic QR generation
paymentIntegrationsRouter.post(
  '/generate-khqr',
  paymentIntegrationsController.generateBakongQrHandler,
);

// Authenticated integration status
paymentIntegrationsRouter.get(
  '/integrations',
  authenticate,
  requireTenantContext,
  requirePermission('tenant.view'),
  paymentIntegrationsController.getIntegrationStatusHandler,
);
