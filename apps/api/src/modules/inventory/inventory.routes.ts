import {
  createStockAdjustmentSchema,
  listStockAdjustmentsQuerySchema,
  listStockMovementsQuerySchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './inventory.controller';

const router = Router();
router.use(authenticate, requireTenantContext);

router.get('/balances', requirePermission('inventory.view'), controller.getBalances);
router.get(
  '/movements',
  requirePermission('inventory.view'),
  validate({ query: listStockMovementsQuerySchema }),
  controller.getMovements,
);
router.get(
  '/movements/:movementId',
  requirePermission('inventory.view'),
  validate({ params: z.object({ movementId: z.string().uuid() }) }),
  controller.getMovementDetail,
);
router.get(
  '/adjustments',
  requirePermission('inventory.view'),
  validate({ query: listStockAdjustmentsQuerySchema }),
  controller.getAdjustments,
);
router.get(
  '/adjustments/:adjustmentId',
  requirePermission('inventory.view'),
  validate({ params: z.object({ adjustmentId: z.string().uuid() }) }),
  controller.getAdjustmentDetail,
);
router.post(
  '/adjustments',
  requirePermission('inventory.adjust'),
  validate({ body: createStockAdjustmentSchema }),
  controller.postAdjustment,
);

export const inventoryRouter = router;

