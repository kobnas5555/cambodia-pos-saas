import type { Request, Response } from 'express';
import {
  createStockTransferSchema,
  stockTransferQuerySchema,
} from '@cambodia-pos/shared';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as transfersService from './transfers.service';

export const createStockTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : req.body.fromBranchId;
  const actor = {
    userId: req.auth!.userId,
    employeeId: req.tenant!.employeeId,
    ipAddress: req.ip || null,
  };
  const input = createStockTransferSchema.parse(req.body);

  const result = await transfersService.createStockTransfer(
    tenantId,
    branchId,
    actor,
    input,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

export const sendStockTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const actor = {
    userId: req.auth!.userId,
    employeeId: req.tenant!.employeeId,
    ipAddress: req.ip || null,
  };
  const transferId = req.params.id;

  const result = await transfersService.sendStockTransfer(
    tenantId,
    transferId,
    actor,
  );

  res.json({
    success: true,
    data: result,
  });
});

export const receiveStockTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const actor = {
    userId: req.auth!.userId,
    employeeId: req.tenant!.employeeId,
    ipAddress: req.ip || null,
  };
  const transferId = req.params.id;

  const result = await transfersService.receiveStockTransfer(
    tenantId,
    transferId,
    actor,
  );

  res.json({
    success: true,
    data: result,
  });
});

export const cancelStockTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const actor = {
    userId: req.auth!.userId,
    employeeId: req.tenant!.employeeId,
    ipAddress: req.ip || null,
  };
  const transferId = req.params.id;

  const result = await transfersService.cancelStockTransfer(
    tenantId,
    transferId,
    actor,
  );

  res.json(result);
});

export const listStockTransfersHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const query = stockTransferQuerySchema.parse(req.query);

  const result = await transfersService.listStockTransfers(tenantId, query);

  res.json({
    success: true,
    ...result,
  });
});

export const getStockTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const transferId = req.params.id;

  const result = await transfersService.getStockTransfer(tenantId, transferId);

  res.json({
    success: true,
    data: result,
  });
});
