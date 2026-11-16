import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as catalogService from './catalog.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

// Categories
export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const result = await catalogService.listCategories(req.tenant!.tenantId, req.query as any);
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
  const data = await catalogService.createCategory(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchCategory = asyncHandler(async (req: Request, res: Response) => {
  const data = await catalogService.updateCategory(
    req.tenant!.tenantId,
    req.params.categoryId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const data = await catalogService.deleteCategory(
    req.tenant!.tenantId,
    req.params.categoryId,
    actor(req),
  );
  res.json({ success: true, data });
});

// Units
export const getUnits = asyncHandler(async (req: Request, res: Response) => {
  const data = await catalogService.listUnits(req.tenant!.tenantId);
  res.json({ success: true, data });
});

export const postUnit = asyncHandler(async (req: Request, res: Response) => {
  const data = await catalogService.createUnit(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchUnit = asyncHandler(async (req: Request, res: Response) => {
  const data = await catalogService.updateUnit(
    req.tenant!.tenantId,
    req.params.unitId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

// Suppliers
export const getSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const result = await catalogService.listSuppliers(req.tenant!.tenantId, req.query as any);
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
  const data = await catalogService.createSupplier(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchSupplier = asyncHandler(async (req: Request, res: Response) => {
  const data = await catalogService.updateSupplier(
    req.tenant!.tenantId,
    req.params.supplierId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const data = await catalogService.deleteSupplier(
    req.tenant!.tenantId,
    req.params.supplierId,
    actor(req),
  );
  res.json({ success: true, data });
});

// Products
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const result = await catalogService.listProducts(req.tenant!.tenantId, req.query as any);
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
  const data = await catalogService.createProduct(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchProduct = asyncHandler(async (req: Request, res: Response) => {
  const data = await catalogService.updateProduct(
    req.tenant!.tenantId,
    req.params.productId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const mode = req.query.mode as string | undefined;
  const data = await catalogService.deleteProduct(
    req.tenant!.tenantId,
    req.params.productId,
    actor(req),
    mode,
  );
  res.json({ success: true, data });
});

