import { createOrderSchema, createSaleReturnSchema } from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './sales.controller';

const idParam = z.object({ orderId: z.string().uuid() });
const returnIdParam = z.object({ returnId: z.string().uuid() });

export const ordersRouter = Router();
ordersRouter.use(authenticate, requireTenantContext);
ordersRouter.get('/', requirePermission('sales.view'), controller.getOrders);
ordersRouter.post('/', requirePermission('sales.create'), validate({ body: createOrderSchema }), controller.postOrder);
ordersRouter.get('/:orderId', requirePermission('sales.view'), validate({ params: idParam }), controller.getOrder);

export const paymentsRouter = Router();
paymentsRouter.use(authenticate, requireTenantContext);
paymentsRouter.get('/', requirePermission('sales.view'), controller.getPayments);

export const returnsRouter = Router();
returnsRouter.use(authenticate, requireTenantContext);
returnsRouter.get('/', requirePermission('sales.view'), controller.getSaleReturns);
returnsRouter.post('/', requirePermission('sales.refund'), validate({ body: createSaleReturnSchema }), controller.postSaleReturn);
returnsRouter.get('/:returnId', requirePermission('sales.view'), validate({ params: returnIdParam }), controller.getSaleReturn);

