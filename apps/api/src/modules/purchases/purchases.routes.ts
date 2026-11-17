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
import * as controller from './purchases.controller';
import * as purchaseItemsController from '../purchase-items/purchase-items.controller';
import * as purchasePaymentsController from '../purchase-payments/purchase-payments.controller';

const router = Router();
const idParam = z.object({ purchaseId: z.string().uuid() });
const paymentIdParam = z.object({ paymentId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get(
  '/',
  requirePermission('purchases.view'),
  validate({ query: listPurchasesQuerySchema }),
  controller.getPurchases,
);
router.get(
  '/payments',
  requirePermission('purchases.view'),
  validate({ query: listPurchasePaymentsQuerySchema }),
  purchasePaymentsController.getPayments,
);
router.get(
  '/payments/:paymentId',
  requirePermission('purchases.view'),
  validate({ params: paymentIdParam }),
  purchasePaymentsController.getPaymentDetail,
);
router.get(
  '/items',
  requirePermission('purchases.view'),
  validate({ query: listPurchaseItemsQuerySchema }),
  purchaseItemsController.getPurchaseItems,
);
router.post(
  '/',
  requirePermission('purchases.create'),
  validate({ body: createPurchaseSchema }),
  controller.postPurchase,
);
router.get(
  '/:purchaseId',
  requirePermission('purchases.view'),
  validate({ params: idParam }),
  controller.getPurchase,
);
router.get(
  '/:purchaseId/items',
  requirePermission('purchases.view'),
  validate({ params: idParam }),
  purchaseItemsController.getPurchaseItems,
);
router.get(
  '/:purchaseId/payments',
  requirePermission('purchases.view'),
  validate({ params: idParam }),
  purchasePaymentsController.getPayments,
);
router.post(
  '/:purchaseId/receive',
  requirePermission('purchases.create'),
  validate({ params: idParam }),
  controller.postReceivePurchase,
);
router.post(
  '/:purchaseId/payments',
  requirePermission('purchases.pay'),
  validate({ params: idParam, body: createPurchasePaymentSchema }),
  purchasePaymentsController.postPayment,
);

export const purchasesRouter = router;
