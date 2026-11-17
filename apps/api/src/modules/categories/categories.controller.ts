import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as categoriesService from './categories.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const result = await categoriesService.listCategories(req.tenant!.tenantId, req.query as any);
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

export const postCategory = asyncHandler(async (req: Request, res: Response) => {
  const data = await categoriesService.createCategory(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchCategory = asyncHandler(async (req: Request, res: Response) => {
  const data = await categoriesService.updateCategory(
    req.tenant!.tenantId,
    req.params.categoryId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const data = await categoriesService.deleteCategory(
    req.tenant!.tenantId,
    req.params.categoryId,
    actor(req),
  );
  res.json({ success: true, data });
});

