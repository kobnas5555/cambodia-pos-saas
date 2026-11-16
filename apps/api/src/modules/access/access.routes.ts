import {
  createEmployeeSchema,
  createRoleSchema,
  inviteEmployeeSchema,
  updateEmployeeSchema,
  updateRoleSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './access.controller';

const router = Router();
const idParam = (key: string) => z.object({ [key]: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/permissions', requirePermission('roles.view'), controller.getPermissions);
router.get('/roles', requirePermission('roles.view'), controller.getRoles);
router.post('/roles', requirePermission('roles.manage'), validate({ body: createRoleSchema }), controller.postRole);
router.patch(
  '/roles/:roleId',
  requirePermission('roles.manage'),
  validate({ params: idParam('roleId'), body: updateRoleSchema }),
  controller.patchRole,
);
router.delete(
  '/roles/:roleId',
  requirePermission('roles.manage'),
  validate({ params: idParam('roleId') }),
  controller.removeRole,
);

router.get('/employees', requirePermission('employees.view'), controller.getEmployees);
router.post(
  '/employees',
  requirePermission('employees.create'),
  validate({ body: createEmployeeSchema }),
  controller.postEmployee,
);
router.patch(
  '/employees/:employeeId',
  requirePermission('employees.update'),
  validate({ params: idParam('employeeId'), body: updateEmployeeSchema }),
  controller.patchEmployee,
);

router.get('/invitations', requirePermission('employees.view'), controller.getInvitations);
router.post(
  '/invitations',
  requirePermission('employees.create'),
  validate({ body: inviteEmployeeSchema }),
  controller.postInvitation,
);

export const accessRouter = router;

