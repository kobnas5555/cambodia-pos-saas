import {
  createProductSchema,
  updateProductSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './products.controller';

const router = Router();
const idParam = z.object({ productId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('products.view'), controller.getProducts);
router.post('/', requirePermission('products.create'), validate({ body: createProductSchema }), controller.postProduct);
router.patch(
  '/:productId',
  requirePermission('products.update'),
  validate({ params: idParam, body: updateProductSchema }),
  controller.patchProduct,
);
router.delete(
  '/:productId',
  requirePermission('products.archive'),
  validate({ params: idParam }),
  controller.deleteProduct,
);

export const productsRouter = router;

