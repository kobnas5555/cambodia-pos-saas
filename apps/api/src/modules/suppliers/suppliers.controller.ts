import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as suppliersService from './suppliers.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const result = await suppliersService.listSuppliers(req.tenant!.tenantId, req.query as any);
  res.json({
    success: true,
    data: result.items,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  });
});

export const postSupplier = asyncHandler(async (req: Request, res: Response) => {
  const data = await suppliersService.createSupplier(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchSupplier = asyncHandler(async (req: Request, res: Response) => {
  const data = await suppliersService.updateSupplier(
    req.tenant!.tenantId,
    req.params.supplierId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const data = await suppliersService.deleteSupplier(
    req.tenant!.tenantId,
    req.params.supplierId,
    actor(req),
  );
  res.json({ success: true, data });
});

