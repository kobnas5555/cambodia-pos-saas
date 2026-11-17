import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { stockBalancesRouter } from '../stock-balances/stock-balances.routes';
import { stockMovementsRouter } from '../stock-movements/stock-movements.routes';
import { stockAdjustmentsRouter } from '../stock-adjustments/stock-adjustments.routes';

const router = Router();
router.use(authenticate, requireTenantContext);

router.use('/balances', stockBalancesRouter);
router.use('/movements', stockMovementsRouter);
router.use('/adjustments', stockAdjustmentsRouter);

export const inventoryRouter = router;
