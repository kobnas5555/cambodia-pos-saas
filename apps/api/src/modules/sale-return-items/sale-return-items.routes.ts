import { listSaleReturnItemsQuerySchema } from '@cambodia-pos/shared';
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './sale-return-items.controller';

const router = Router();
router.use(authenticate, requireTenantContext);
router.get('/', requirePermission('sales.view'), validate({ query: listSaleReturnItemsQuerySchema }), controller.getSaleReturnItems);

export const saleReturnItemsRouter = router;

