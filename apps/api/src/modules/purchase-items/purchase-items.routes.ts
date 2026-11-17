import { listPurchaseItemsQuerySchema } from '@cambodia-pos/shared';
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './purchase-items.controller';

const router = Router();
router.use(authenticate, requireTenantContext);
router.get('/', requirePermission('purchases.view'), validate({ query: listPurchaseItemsQuerySchema }), controller.getPurchaseItems);

export const purchaseItemsRouter = router;

