import {
  createIncomeSchema,
  listIncomesQuerySchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './incomes.controller';

const router = Router();
const incomeIdParam = z.object({ incomeId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get(
  '/',
  requirePermission('finance.view'),
  validate({ query: listIncomesQuerySchema }),
  controller.getIncomes,
);
router.get(
  '/:incomeId',
  requirePermission('finance.view'),
  validate({ params: incomeIdParam }),
  controller.getIncomeDetail,
);
router.post(
  '/',
  requirePermission('finance.manage'),
  validate({ body: createIncomeSchema }),
  controller.postIncome,
);

export const incomesRouter = router;

