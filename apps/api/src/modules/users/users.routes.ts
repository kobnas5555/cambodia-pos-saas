import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './users.controller';

const router = Router();
const idParam = z.object({ userId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('employees.view'), controller.getUsers);
router.get('/:userId', requirePermission('employees.view'), validate({ params: idParam }), controller.getUserById);

export const usersRouter = router;

