import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import * as controller from './user-roles.controller';

const router = Router();
router.use(authenticate, requireTenantContext);
router.get('/', requirePermission('roles.view'), controller.getUserRoles);

export const userRolesRouter = router;

