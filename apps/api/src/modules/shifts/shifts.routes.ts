import { closeShiftSchema, listShiftsQuerySchema, openShiftSchema } from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './shifts.controller';

const router = Router();
const idParam = z.object({ shiftId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('shifts.view'), validate({ query: listShiftsQuerySchema }), controller.list);
router.get('/current', requirePermission('shifts.view'), controller.current);
router.get('/:shiftId', requirePermission('shifts.view'), validate({ params: idParam }), controller.getOne);
router.post('/open', requirePermission('shifts.manage'), validate({ body: openShiftSchema }), controller.open);
router.post(
  '/:shiftId/close',
  requirePermission('shifts.manage'),
  validate({ params: idParam, body: closeShiftSchema }),
  controller.close,
);

export const shiftsRouter = router;

