import {
  createUnitSchema,
  updateUnitSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './units.controller';

const router = Router();
const idParam = z.object({ unitId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('products.view'), controller.getUnits);
router.post('/', requirePermission('products.create'), validate({ body: createUnitSchema }), controller.postUnit);
router.patch(
  '/:unitId',
  requirePermission('products.update'),
  validate({ params: idParam, body: updateUnitSchema }),
  controller.patchUnit,
);

export const unitsRouter = router;

