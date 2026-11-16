import { createCustomerSchema, updateCustomerSchema } from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './customers.controller';

const router = Router();
const idParam = z.object({ customerId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/', requirePermission('customers.view'), controller.list);
router.post('/', requirePermission('customers.manage'), validate({ body: createCustomerSchema }), controller.create);
router.get('/:customerId', requirePermission('customers.view'), validate({ params: idParam }), controller.getOne);
router.patch(
  '/:customerId',
  requirePermission('customers.manage'),
  validate({ params: idParam, body: updateCustomerSchema }),
  controller.update,
);

export const customersRouter = router;

