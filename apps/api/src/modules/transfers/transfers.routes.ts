import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import * as transfersController from './transfers.controller';

export const transfersRouter = Router();

transfersRouter.use(authenticate, requireTenantContext);

transfersRouter.get(
  '/',
  requirePermission('inventory.view'),
  transfersController.listStockTransfersHandler,
);

transfersRouter.get(
  '/:id',
  requirePermission('inventory.view'),
  transfersController.getStockTransferHandler,
);

transfersRouter.post(
  '/',
  requirePermission('inventory.adjust'),
  transfersController.createStockTransferHandler,
);

transfersRouter.post(
  '/:id/send',
  requirePermission('inventory.adjust'),
  transfersController.sendStockTransferHandler,
);

transfersRouter.post(
  '/:id/receive',
  requirePermission('inventory.adjust'),
  transfersController.receiveStockTransferHandler,
);

transfersRouter.post(
  '/:id/cancel',
  requirePermission('inventory.adjust'),
  transfersController.cancelStockTransferHandler,
);
