import {
  createExpenseTypeSchema,
  listExpenseTypesQuerySchema,
  updateExpenseTypeSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './expense-types.controller';

const router = Router();
const idParam = z.object({ expenseTypeId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get(
  '/',
  requirePermission('finance.view'),
  validate({ query: listExpenseTypesQuerySchema }),
  controller.getExpenseTypes,
);
router.get(
  '/:expenseTypeId',
  requirePermission('finance.view'),
  validate({ params: idParam }),
  controller.getExpenseTypeDetail,
);
router.post(
  '/',
  requirePermission('finance.manage'),
  validate({ body: createExpenseTypeSchema }),
  controller.postExpenseType,
);
router.patch(
  '/:expenseTypeId',
  requirePermission('finance.manage'),
  validate({ params: idParam, body: updateExpenseTypeSchema }),
  controller.patchExpenseType,
);

export const expenseTypesRouter = router;

