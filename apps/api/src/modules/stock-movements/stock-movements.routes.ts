import { listStockMovementsQuerySchema } from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './stock-movements.controller';

const router = Router();
const movementIdParam = z.object({ movementId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get(
  '/',
  requirePermission('inventory.view'),
  validate({ query: listStockMovementsQuerySchema }),
  controller.getMovements,
);
router.get(
  '/:movementId',
  requirePermission('inventory.view'),
  validate({ params: movementIdParam }),
  controller.getMovementDetail,
);

export const stockMovementsRouter = router;

