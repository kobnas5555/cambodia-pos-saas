import {
  createRoleSchema,
  updateRoleSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './roles.controller';

const router = Router();
const idParam = z.object({ roleId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('roles.view'), controller.getRoles);
router.post('/', requirePermission('roles.manage'), validate({ body: createRoleSchema }), controller.postRole);
router.patch(
  '/:roleId',
  requirePermission('roles.manage'),
  validate({ params: idParam, body: updateRoleSchema }),
  controller.patchRole,
);
router.delete(
  '/:roleId',
  requirePermission('roles.manage'),
  validate({ params: idParam }),
  controller.removeRole,
);

export const rolesRouter = router;

