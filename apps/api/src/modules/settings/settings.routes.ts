import {
  createExchangeRateSchema,
  listSettingsQuerySchema,
  updateSettingsSchema,
  userPreferencesSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './settings.controller';

const router = Router();
router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('tenant.view'), controller.getSettings);
router.get(
  '/records',
  requirePermission('tenant.view'),
  validate({ query: listSettingsQuerySchema }),
  controller.getSettingRecords,
);
router.get(
  '/records/:id',
  requirePermission('tenant.view'),
  controller.getSettingRecord,
);
router.put('/', requirePermission('tenant.update'), validate({ body: updateSettingsSchema }), controller.putSettings);
router.post(
  '/exchange-rates',
  requirePermission('tenant.update'),
  validate({ body: createExchangeRateSchema }),
  controller.postExchangeRate,
);
router.get('/user-preferences', controller.getUserPreferences);
router.put(
  '/user-preferences',
  validate({ body: userPreferencesSchema }),
  controller.putUserPreferences,
);

export const settingsRouter = router;

