import {
  createBranchSchema,
  listBranchesQuerySchema,
  updateBranchSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import * as controller from './branches.controller';

const router = Router();
const branchIdParam = z.object({ branchId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get(
  '/',
  requirePermission('branches.view'),
  validate({ query: listBranchesQuerySchema }),
  controller.list,
);
router.post(
  '/',
  requirePermission('branches.create'),
  validate({ body: createBranchSchema }),
  controller.create,
);
router.get(
  '/:branchId',
  requirePermission('branches.view'),
  validate({ params: branchIdParam }),
  controller.getOne,
);
router.patch(
  '/:branchId',
  requirePermission('branches.update'),
  validate({ params: branchIdParam, body: updateBranchSchema }),
  controller.update,
);
router.delete(
  '/:branchId',
  requirePermission('branches.delete'),
  validate({ params: branchIdParam }),
  controller.deactivate,
);

export const branchesRouter = router;

