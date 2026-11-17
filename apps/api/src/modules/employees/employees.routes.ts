import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './employees.controller';

const router = Router();
const idParam = z.object({ employeeId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('employees.view'), controller.getEmployees);
router.post(
  '/',
  requirePermission('employees.create'),
  validate({ body: createEmployeeSchema }),
  controller.postEmployee,
);
router.patch(
  '/:employeeId',
  requirePermission('employees.update'),
  validate({ params: idParam, body: updateEmployeeSchema }),
  controller.patchEmployee,
);

export const employeesRouter = router;

