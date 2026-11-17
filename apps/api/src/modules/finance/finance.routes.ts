import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { expenseTypesRouter } from '../expense-types/expense-types.routes';
import { expensesRouter } from '../expenses/expenses.routes';
import { incomesRouter } from '../incomes/incomes.routes';
import * as controller from './finance.controller';

const router = Router();
router.use(authenticate, requireTenantContext);

router.get('/summary', requirePermission('finance.view'), controller.getSummary);
router.get('/transactions', requirePermission('finance.view'), controller.getTransactions);

router.use('/expense-types', expenseTypesRouter);
router.use('/expenses', expensesRouter);
router.use('/incomes', incomesRouter);

export const financeRouter = router;
