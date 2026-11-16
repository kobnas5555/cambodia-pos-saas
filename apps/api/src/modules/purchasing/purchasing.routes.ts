import {
  createPurchasePaymentSchema,
  createPurchaseSchema,
  listPurchaseItemsQuerySchema,
  listPurchasePaymentsQuerySchema,
  listPurchasesQuerySchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './purchasing.controller';

const router = Router();
const idParam = z.object({ purchaseId: z.string().uuid() });
const paymentIdParam = z.object({ paymentId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get(
  '/',
  requirePermission('purchases.view'),
  validate({ query: listPurchasesQuerySchema }),
  controller.list,
);
router.get(
  '/payments',
  requirePermission('purchases.view'),
  validate({ query: listPurchasePaymentsQuerySchema }),
  controller.listPayments,
);
router.get(
  '/payments/:paymentId',
  requirePermission('purchases.view'),
  validate({ params: paymentIdParam }),
  controller.getPayment,
);
router.get(
  '/items',
  requirePermission('purchases.view'),
  validate({ query: listPurchaseItemsQuerySchema }),
  controller.listItems,
);
router.post('/', requirePermission('purchases.create'), validate({ body: createPurchaseSchema }), controller.create);
router.get('/:purchaseId', requirePermission('purchases.view'), validate({ params: idParam }), controller.getOne);
router.get('/:purchaseId/items', requirePermission('purchases.view'), validate({ params: idParam }), controller.listItems);
router.get('/:purchaseId/payments', requirePermission('purchases.view'), validate({ params: idParam }), controller.listPayments);
router.post('/:purchaseId/receive', requirePermission('purchases.create'), validate({ params: idParam }), controller.receive);
router.post(
  '/:purchaseId/payments',
  requirePermission('purchases.pay'),
  validate({ params: idParam, body: createPurchasePaymentSchema }),
  controller.addPayment,
);

export const purchasingRouter = router;

