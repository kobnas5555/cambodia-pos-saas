import type { Request, Response } from 'express';
import { changePlanSchema } from '@cambodia-pos/shared';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as billingService from './billing.service';

export const getSubscriptionPlansHandler = asyncHandler(async (_req: Request, res: Response) => {
  const plans = await billingService.getSubscriptionPlans();
  res.json({
    success: true,
    data: plans,
  });
});

export const getTenantSubscriptionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const result = await billingService.getTenantSubscription(tenantId);
  res.json({
    success: true,
    data: result,
  });
});

export const changeSubscriptionPlanHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const actor = {
    userId: req.auth!.userId,
    employeeId: req.tenant!.employeeId,
    ipAddress: req.ip || null,
  };
  const input = changePlanSchema.parse(req.body);

  const result = await billingService.changeSubscriptionPlan(tenantId, actor, input);
  res.json({
    success: true,
    data: result,
  });
});
