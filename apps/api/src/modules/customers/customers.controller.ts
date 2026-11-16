import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as customersService from './customers.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await customersService.listCustomers(req.tenant!.tenantId, req.query as any);
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
  const data = await customersService.getCustomerById(req.tenant!.tenantId, req.params.customerId);
  res.json({ success: true, data });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = await customersService.createCustomer(
    req.tenant!.tenantId,
    { userId: req.auth!.userId, employeeId: req.tenant!.employeeId, ipAddress: req.ip || null },
    req.body,
  );
  res.status(201).json({ success: true, data });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const data = await customersService.updateCustomer(
    req.tenant!.tenantId,
    req.params.customerId,
    req.body,
    { userId: req.auth!.userId, employeeId: req.tenant!.employeeId, ipAddress: req.ip || null },
  );
  res.json({ success: true, data });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const mode = typeof req.query.mode === 'string' ? req.query.mode : undefined;
  const data = await customersService.deleteCustomer(
    req.tenant!.tenantId,
    req.params.customerId,
    { userId: req.auth!.userId, employeeId: req.tenant!.employeeId, ipAddress: req.ip || null },
    mode,
  );
  res.json({ success: true, data });
});

