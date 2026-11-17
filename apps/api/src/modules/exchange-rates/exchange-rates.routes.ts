import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './exchange-rates.controller';

const router = Router();
const createExchangeRateSchema = z.object({
  baseCurrency: z.string().min(1).max(10),
  targetCurrency: z.string().min(1).max(10),
  rate: z.string().min(1),
});

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('settings.view'), controller.getExchangeRates);
router.post(
  '/',
  requirePermission('settings.manage'),
  validate({ body: createExchangeRateSchema }),
  controller.postExchangeRate,
);

export const exchangeRatesRouter = router;

