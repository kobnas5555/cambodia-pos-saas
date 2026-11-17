import {
  createPurchasePaymentSchema,
  listPurchasePaymentsQuerySchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './purchase-payments.controller';

const router = Router();
const paymentIdParam = z.object({ paymentId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get(
  '/',
  requirePermission('purchases.view'),
  validate({ query: listPurchasePaymentsQuerySchema }),
  controller.getPayments,
);
router.get(
  '/:paymentId',
  requirePermission('purchases.view'),
  validate({ params: paymentIdParam }),
  controller.getPaymentDetail,
);
router.post(
  '/',
  requirePermission('purchases.create'),
  validate({ body: createPurchasePaymentSchema }),
  controller.postPayment,
);

export const purchasePaymentsRouter = router;

