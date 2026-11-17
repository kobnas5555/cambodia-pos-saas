import {
  createExpenseSchema,
  listExpensesQuerySchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './expenses.controller';

const router = Router();
const expenseIdParam = z.object({ expenseId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get(
  '/',
  requirePermission('finance.view'),
  validate({ query: listExpensesQuerySchema }),
  controller.getExpenses,
);
router.get(
  '/:expenseId',
  requirePermission('finance.view'),
  validate({ params: expenseIdParam }),
  controller.getExpenseDetail,
);
router.post(
  '/',
  requirePermission('finance.manage'),
  validate({ body: createExpenseSchema }),
  controller.postExpense,
);

export const expensesRouter = router;

