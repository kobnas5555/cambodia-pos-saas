import {
  createStockAdjustmentSchema,
  listStockAdjustmentsQuerySchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './stock-adjustments.controller';

const router = Router();
const adjustmentIdParam = z.object({ adjustmentId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get(
  '/',
  requirePermission('inventory.view'),
  validate({ query: listStockAdjustmentsQuerySchema }),
  controller.getAdjustments,
);
router.get(
  '/:adjustmentId',
  requirePermission('inventory.view'),
  validate({ params: adjustmentIdParam }),
  controller.getAdjustmentDetail,
);
router.post(
  '/',
  requirePermission('inventory.adjust'),
  validate({ body: createStockAdjustmentSchema }),
  controller.postAdjustment,
);

export const stockAdjustmentsRouter = router;

