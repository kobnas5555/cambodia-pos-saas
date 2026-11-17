import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as productsService from './products.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const result = await productsService.listProducts(req.tenant!.tenantId, req.query as any);
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

export const postProduct = asyncHandler(async (req: Request, res: Response) => {
  const data = await productsService.createProduct(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchProduct = asyncHandler(async (req: Request, res: Response) => {
  const data = await productsService.updateProduct(
    req.tenant!.tenantId,
    req.params.productId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const mode = req.query.mode as string | undefined;
  const data = await productsService.deleteProduct(
    req.tenant!.tenantId,
    req.params.productId,
    actor(req),
    mode,
  );
  res.json({ success: true, data });
});

