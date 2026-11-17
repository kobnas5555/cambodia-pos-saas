import { listStockBalancesQuerySchema } from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './stock-balances.controller';

const router = Router();
const balanceIdParam = z.object({ balanceId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get(
  '/',
  requirePermission('inventory.view'),
  validate({ query: listStockBalancesQuerySchema }),
  controller.getBalances,
);
router.get(
  '/:balanceId',
  requirePermission('inventory.view'),
  validate({ params: balanceIdParam }),
  controller.getBalanceDetail,
);

export const stockBalancesRouter = router;

