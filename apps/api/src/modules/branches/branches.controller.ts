import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as branchesService from './branches.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await branchesService.listBranches(req.tenant!.tenantId, req.query as never);
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

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const branch = await branchesService.getBranchById(req.tenant!.tenantId, req.params.branchId);
  res.json({ success: true, data: branch });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const branch = await branchesService.createBranch(
    req.tenant!.tenantId,
    {
      userId: req.auth!.userId,
      employeeId: req.tenant!.employeeId,
      ipAddress: req.ip || null,
    },
    req.body,
  );
  res.status(201).json({ success: true, data: branch });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const branch = await branchesService.updateBranch(
    req.tenant!.tenantId,
    req.params.branchId,
    {
      userId: req.auth!.userId,
      employeeId: req.tenant!.employeeId,
      ipAddress: req.ip || null,
    },
    req.body,
  );
  res.json({ success: true, data: branch });
});

export const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const branch = await branchesService.deactivateBranch(
    req.tenant!.tenantId,
    req.params.branchId,
    {
      userId: req.auth!.userId,
      employeeId: req.tenant!.employeeId,
      ipAddress: req.ip || null,
    },
  );
  res.json({ success: true, data: branch });
});

