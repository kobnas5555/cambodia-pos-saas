import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors/AppError';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import * as controller from './platform.controller';

function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth?.isPlatformAdmin) {
    next(AppError.forbidden('SaaS platform administrator access required', 'PLATFORM_ADMIN_ONLY'));
    return;
  }
  next();
}

const router = Router();
router.use(authenticate, requirePlatformAdmin);

// 1. SaaS Dashboard Overview
router.get('/overview', controller.getOverview);

// 2. Business / Tenant Management
router.get('/tenants', controller.getTenants);
router.patch(
  '/tenants/:tenantId/status',
  validate({
    params: z.object({ tenantId: z.string().uuid() }),
    body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }),
  }),
  controller.patchTenantStatus,
);

// 3. Subscription Plans
router.get('/plans', controller.getPlans);
router.post(
  '/plans',
  validate({
    body: z.object({
      id: z.string().uuid().optional(),
      tier: z.string().min(2),
      name: z.string().min(2),
      description: z.string().optional(),
      monthlyPrice: z.number().min(0),
      yearlyPrice: z.number().min(0),
      maxBranches: z.number().int().min(1),
      maxEmployees: z.number().int().min(1),
      maxProducts: z.number().int().min(1),
      features: z.array(z.string()),
    }),
  }),
  controller.postPlan,
);

// 4. Subscriptions
router.get('/subscriptions', controller.getSubscriptions);
router.patch(
  '/subscriptions/:subscriptionId',
  validate({
    params: z.object({ subscriptionId: z.string() }),
    body: z.object({
      status: z.enum(['ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELLED']).optional(),
      planTier: z.string().optional(),
    }),
  }),
  controller.patchSubscription,
);

// 5. Platform Users
router.get('/users', controller.getUsers);
router.patch(
  '/users/:userId',
  validate({
    params: z.object({ userId: z.string().uuid() }),
    body: z.object({
      isPlatformAdmin: z.boolean().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    }),
  }),
  controller.patchUser,
);

// 6. System Monitoring & Health
router.get('/monitoring', controller.getMonitoring);

// 7. Platform Activity Logs
router.get('/activity-logs', controller.getActivityLogs);

export const platformRouter = router;
