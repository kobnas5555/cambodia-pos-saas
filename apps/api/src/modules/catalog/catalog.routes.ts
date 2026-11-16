import {
  createCategorySchema,
  createProductSchema,
  createSupplierSchema,
  createUnitSchema,
  updateCategorySchema,
  updateProductSchema,
  updateSupplierSchema,
  updateUnitSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './catalog.controller';

const idParam = (key: string) => z.object({ [key]: z.string().uuid() });

export const categoriesRouter = Router();
categoriesRouter.use(authenticate, requireTenantContext);
categoriesRouter.get('/', requirePermission('products.view'), controller.getCategories);
categoriesRouter.post('/', requirePermission('products.create'), validate({ body: createCategorySchema }), controller.postCategory);
categoriesRouter.patch(
  '/:categoryId',
  requirePermission('products.update'),
  validate({ params: idParam('categoryId'), body: updateCategorySchema }),
  controller.patchCategory,
);
categoriesRouter.delete(
  '/:categoryId',
  requirePermission('products.archive'),
  validate({ params: idParam('categoryId') }),
  controller.deleteCategory,
);

export const unitsRouter = Router();
unitsRouter.use(authenticate, requireTenantContext);
unitsRouter.get('/', requirePermission('products.view'), controller.getUnits);
unitsRouter.post('/', requirePermission('products.create'), validate({ body: createUnitSchema }), controller.postUnit);
unitsRouter.patch(
  '/:unitId',
  requirePermission('products.update'),
  validate({ params: idParam('unitId'), body: updateUnitSchema }),
  controller.patchUnit,
);

export const suppliersRouter = Router();
suppliersRouter.use(authenticate, requireTenantContext);
suppliersRouter.get('/', requirePermission('products.view'), controller.getSuppliers);
suppliersRouter.post('/', requirePermission('products.create'), validate({ body: createSupplierSchema }), controller.postSupplier);
suppliersRouter.patch(
  '/:supplierId',
  requirePermission('products.update'),
  validate({ params: idParam('supplierId'), body: updateSupplierSchema }),
  controller.patchSupplier,
);

export const productsRouter = Router();
productsRouter.use(authenticate, requireTenantContext);
productsRouter.get('/', requirePermission('products.view'), controller.getProducts);
productsRouter.post('/', requirePermission('products.create'), validate({ body: createProductSchema }), controller.postProduct);
productsRouter.patch(
  '/:productId',
  requirePermission('products.update'),
  validate({ params: idParam('productId'), body: updateProductSchema }),
  controller.patchProduct,
);
productsRouter.delete(
  '/:productId',
  requirePermission('products.archive'),
  validate({ params: idParam('productId') }),
  controller.deleteProduct,
);

