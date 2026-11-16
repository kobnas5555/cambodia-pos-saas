import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as customersService from './customers.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const data = await customersService.listCustomers(req.tenant!.tenantId, search);
  res.json({ success: true, data });
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
  );
  res.json({ success: true, data });
});

