import { createTenantSchema, updateTenantSchema } from '@cambodia-pos/shared';
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './tenants.controller';

const router = Router();

router.use(authenticate);

// Authenticated user can create an additional business workspace
router.post('/', validate({ body: createTenantSchema }), controller.createTenant);

// Tenant-scoped profile endpoints
router.get('/current', requireTenantContext, requirePermission('tenant.view'), controller.getCurrent);
router.patch(
  '/current',
  requireTenantContext,
  requirePermission('tenant.update'),
  validate({ body: updateTenantSchema }),
  controller.updateCurrent,
);

export const tenantsRouter = router;

