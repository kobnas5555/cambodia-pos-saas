import {
  createCategorySchema,
  updateCategorySchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './categories.controller';

const router = Router();
const idParam = z.object({ categoryId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('products.view'), controller.getCategories);
router.post('/', requirePermission('products.create'), validate({ body: createCategorySchema }), controller.postCategory);
router.patch(
  '/:categoryId',
  requirePermission('products.update'),
  validate({ params: idParam, body: updateCategorySchema }),
  controller.patchCategory,
);
router.delete(
  '/:categoryId',
  requirePermission('products.archive'),
  validate({ params: idParam }),
  controller.deleteCategory,
);

export const categoriesRouter = router;

