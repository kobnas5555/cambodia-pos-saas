import {
  createSupplierSchema,
  updateSupplierSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './suppliers.controller';

const router = Router();
const idParam = z.object({ supplierId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('products.view'), controller.getSuppliers);
router.post('/', requirePermission('products.create'), validate({ body: createSupplierSchema }), controller.postSupplier);
router.patch(
  '/:supplierId',
  requirePermission('products.update'),
  validate({ params: idParam, body: updateSupplierSchema }),
  controller.patchSupplier,
);
router.delete(
  '/:supplierId',
  requirePermission('products.archive'),
  validate({ params: idParam }),
  controller.deleteSupplier,
);

export const suppliersRouter = router;

