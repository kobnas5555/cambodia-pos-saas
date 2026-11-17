import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as expenseTypesService from './expense-types.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getExpenseTypes = asyncHandler(async (req: Request, res: Response) => {
  const result = await expenseTypesService.listExpenseTypes(req.tenant!.tenantId, req.query as any);
  res.json({
    success: true,
    data: (result as any).items ?? result,
    pagination: (result as any).total !== undefined
      ? {
          total: (result as any).total,
          page: (result as any).page,
          limit: (result as any).limit,
          totalPages: (result as any).totalPages,
        }
      : undefined,
  });
});

export const getExpenseTypeDetail = asyncHandler(async (req: Request, res: Response) => {
  const data = await expenseTypesService.getExpenseTypeById(req.tenant!.tenantId, req.params.expenseTypeId);
  res.json({ success: true, data });
});

export const postExpenseType = asyncHandler(async (req: Request, res: Response) => {
  const data = await expenseTypesService.createExpenseType(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchExpenseType = asyncHandler(async (req: Request, res: Response) => {
  const data = await expenseTypesService.updateExpenseType(
    req.tenant!.tenantId,
    actor(req),
    req.params.expenseTypeId,
    req.body,
  );
  res.json({ success: true, data });
});

