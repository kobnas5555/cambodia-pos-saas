import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import * as controller from './movement-types.controller';

const router = Router();
router.use(authenticate, requireTenantContext);
router.get('/', requirePermission('inventory.view'), controller.getMovementTypes);

export const movementTypesRouter = router;

