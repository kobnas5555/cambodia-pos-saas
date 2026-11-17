import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import * as controller from './employee-branch-access.controller';

const router = Router();
router.use(authenticate, requireTenantContext);
router.get('/', requirePermission('employees.view'), controller.getEmployeeBranchAccess);

export const employeeBranchAccessRouter = router;

