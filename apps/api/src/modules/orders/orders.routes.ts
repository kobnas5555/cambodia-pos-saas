import {
  createOrderSchema,
  listOrderItemsQuerySchema,
  listOrdersQuerySchema,
  listPaymentsQuerySchema,
  listSaleReturnsQuerySchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './orders.controller';
import * as orderItemsController from '../order-items/order-items.controller';
import * as paymentsController from '../payments/payments.controller';
import * as saleReturnsController from '../sale-returns/sale-returns.controller';

const router = Router();
const idParam = z.object({ orderId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/items', requirePermission('sales.view'), validate({ query: listOrderItemsQuerySchema }), orderItemsController.getOrderItems);
router.get('/', requirePermission('sales.view'), validate({ query: listOrdersQuerySchema }), controller.getOrders);
router.post('/', requirePermission('sales.create'), validate({ body: createOrderSchema }), controller.postOrder);
router.get('/:orderId', requirePermission('sales.view'), validate({ params: idParam }), controller.getOrder);
router.get('/:orderId/items', requirePermission('sales.view'), validate({ params: idParam }), orderItemsController.getOrderItems);
router.get('/:orderId/payments', requirePermission('sales.view'), validate({ params: idParam, query: listPaymentsQuerySchema }), paymentsController.getPayments);
router.get('/:orderId/returns', requirePermission('sales.view'), validate({ params: idParam, query: listSaleReturnsQuerySchema }), saleReturnsController.getSaleReturns);

export const ordersRouter = router;
