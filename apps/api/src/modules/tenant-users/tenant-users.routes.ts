import {
  inviteEmployeeSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './tenant-users.controller';

const router = Router();
const idParam = z.object({ id: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('employees.view'), controller.getTenantUsers);
router.get('/invitations', requirePermission('employees.view'), controller.getInvitations);
router.post(
  '/invitations',
  requirePermission('employees.create'),
  validate({ body: inviteEmployeeSchema }),
  controller.postInvitation,
);
router.get('/:id', requirePermission('employees.view'), validate({ params: idParam }), controller.getTenantUserById);

export const tenantUsersRouter = router;

