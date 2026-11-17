import {
  createSaleReturnSchema,
  listSaleReturnItemsQuerySchema,
  listSaleReturnsQuerySchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './sale-returns.controller';
import * as saleReturnItemsController from '../sale-return-items/sale-return-items.controller';

const router = Router();
const returnIdParam = z.object({ returnId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/items', requirePermission('sales.view'), validate({ query: listSaleReturnItemsQuerySchema }), saleReturnItemsController.getSaleReturnItems);
router.get('/', requirePermission('sales.view'), validate({ query: listSaleReturnsQuerySchema }), controller.getSaleReturns);
router.post('/', requirePermission('sales.refund'), validate({ body: createSaleReturnSchema }), controller.postSaleReturn);
router.get('/:returnId', requirePermission('sales.view'), validate({ params: returnIdParam }), controller.getSaleReturn);
router.get('/:returnId/items', requirePermission('sales.view'), validate({ params: returnIdParam, query: listSaleReturnItemsQuerySchema }), saleReturnItemsController.getSaleReturnItems);

export const saleReturnsRouter = router;
