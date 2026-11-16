import {
  createExpenseSchema,
  createExpenseTypeSchema,
  createIncomeSchema,
  updateExpenseTypeSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './finance.controller';

const router = Router();
const idParam = z.object({ expenseTypeId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/summary', requirePermission('finance.view'), controller.getSummary);
router.get('/transactions', requirePermission('finance.view'), controller.getTransactions);
router.get('/expense-types', requirePermission('finance.view'), controller.getExpenseTypes);
router.post(
  '/expense-types',
  requirePermission('finance.manage'),
  validate({ body: createExpenseTypeSchema }),
  controller.postExpenseType,
);
router.patch(
  '/expense-types/:expenseTypeId',
  requirePermission('finance.manage'),
  validate({ params: idParam, body: updateExpenseTypeSchema }),
  controller.patchExpenseType,
);

router.get('/expenses', requirePermission('finance.view'), controller.getExpenses);
router.post(
  '/expenses',
  requirePermission('finance.manage'),
  validate({ body: createExpenseSchema }),
  controller.postExpense,
);

router.get('/incomes', requirePermission('finance.view'), controller.getIncomes);
router.post(
  '/incomes',
  requirePermission('finance.manage'),
  validate({ body: createIncomeSchema }),
  controller.postIncome,
);

export const financeRouter = router;

