import type { ChangePlanInput } from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { generateDocumentNumber } from '../../common/utils/numbering';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';

export interface BillingActor {
  userId: string;
  employeeId?: string | null;
  ipAddress?: string | null;
}

export const DEFAULT_PLANS = [
  {
    tier: 'FREE_TRIAL',
    name: 'Free Trial',
    description: '14-day full access trial for new Cambodian retail shops',
    monthlyPrice: 0,
    yearlyPrice: 0,
    maxBranches: 1,
    maxEmployees: 2,
    maxProducts: 200,
    features: ['pos', 'sales', 'inventory', 'reports'],
  },
  {
    tier: 'STARTER',
    name: 'Starter Plan',
    description: 'Ideal for single-location retail shops and boutique stores',
    monthlyPrice: 19,
    yearlyPrice: 190,
    maxBranches: 1,
    maxEmployees: 5,
    maxProducts: 1000,
    features: ['pos', 'sales', 'inventory', 'customers', 'suppliers', 'reports'],
  },
  {
    tier: 'GROWTH',
    name: 'Growth Plan',
    description: 'Multi-branch retail chains with transit tracking and analytics',
    monthlyPrice: 49,
    yearlyPrice: 490,
    maxBranches: 3,
    maxEmployees: 15,
    maxProducts: 10000,
    features: [
      'pos',
      'sales',
      'inventory',
      'customers',
      'suppliers',
      'transfers',
      'analytics',
      'purchasing',
      'reports',
      'pwa_offline',
    ],
  },
  {
    tier: 'ENTERPRISE',
    name: 'Enterprise Plan',
    description: 'Unlimited branches, custom receipt branding, and dedicated priority support',
    monthlyPrice: 99,
    yearlyPrice: 990,
    maxBranches: 999,
    maxEmployees: 999,
    maxProducts: 999999,
    features: ['all', 'unlimited_branches', 'advanced_analytics', 'api_access', 'custom_receipts'],
  },
];

export async function ensureDefaultPlans() {
  const existing = await (prisma as any).subscriptionPlan.findMany();
  if (existing.length === 0) {
    for (const plan of DEFAULT_PLANS) {
      await (prisma as any).subscriptionPlan.create({
        data: {
          tier: plan.tier,
          name: plan.name,
          description: plan.description,
          monthlyPrice: plan.monthlyPrice,
          yearlyPrice: plan.yearlyPrice,
          maxBranches: plan.maxBranches,
          maxEmployees: plan.maxEmployees,
          maxProducts: plan.maxProducts,
          features: plan.features,
        },
      });
    }
  }
}

export async function getSubscriptionPlans() {
  await ensureDefaultPlans();
  return (prisma as any).subscriptionPlan.findMany();
}

export async function getTenantSubscription(tenantId: string) {
  await ensureDefaultPlans();

  let subscription = await (prisma as any).tenantSubscription.findUnique({
    where: { tenantId },
    include: {
      plan: true,
      invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });

  // If no subscription yet, create default FREE_TRIAL
  if (!subscription) {
    const trialPlan = await (prisma as any).subscriptionPlan.findUnique({
      where: { tier: 'FREE_TRIAL' },
    });
    if (trialPlan) {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      subscription = await (prisma as any).tenantSubscription.create({
        data: {
          tenantId,
          planId: trialPlan.id,
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          paymentMethod: 'BAKONG_KHQR',
        },
        include: {
          plan: true,
          invoices: true,
        },
      });
    }
  }

  // Count usage against limits
  const [branchCount, employeeCount, productCount] = await Promise.all([
    prisma.branch.count({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.employee.count({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.product.count({ where: { tenantId, status: 'ACTIVE' } }),
  ]);

  return {
    subscription,
    usage: {
      branches: { current: branchCount, limit: subscription?.plan?.maxBranches ?? 1 },
      employees: { current: employeeCount, limit: subscription?.plan?.maxEmployees ?? 3 },
      products: { current: productCount, limit: subscription?.plan?.maxProducts ?? 500 },
    },
  };
}

export async function changeSubscriptionPlan(
  tenantId: string,
  actor: BillingActor,
  input: ChangePlanInput,
) {
  await ensureDefaultPlans();

  const plan = await (prisma as any).subscriptionPlan.findUnique({
    where: { tier: input.planTier },
  });

  if (!plan) {
    throw AppError.notFound(`Subscription plan tier ${input.planTier} not found.`);
  }

  const now = new Date();
  const days = input.billingCycle === 'YEARLY' ? 365 : 30;
  const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const amount = input.billingCycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;

  const subscription = await (prisma as any).tenantSubscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      planId: plan.id,
      status: 'ACTIVE',
      billingCycle: input.billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      paymentMethod: input.paymentMethod,
    },
    update: {
      planId: plan.id,
      status: 'ACTIVE',
      billingCycle: input.billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      paymentMethod: input.paymentMethod,
    },
    include: { plan: true },
  });

  // Generate an invoice
  const invoiceNumber = generateDocumentNumber('SUB-INV', Date.now() % 100000);
  await (prisma as any).subscriptionInvoice.create({
    data: {
      tenantId,
      subscriptionId: subscription.id,
      invoiceNumber,
      amount: amount.toString(),
      currency: 'USD',
      status: 'PAID',
      paidAt: now,
    },
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId: actor.employeeId,
    action: 'subscription.changed',
    module: 'settings',
    recordType: 'TenantSubscription',
    recordId: subscription.id,
    newValues: {
      planTier: plan.tier,
      billingCycle: input.billingCycle,
      amount: amount.toString(),
    },
    ipAddress: actor.ipAddress,
  });

  return getTenantSubscription(tenantId);
}

export async function checkTenantQuota(
  tenantId: string,
  resource: 'branches' | 'employees' | 'products',
) {
  const { subscription, usage } = await getTenantSubscription(tenantId);
  const resourceUsage = usage[resource];

  if (resourceUsage.current >= resourceUsage.limit) {
    throw AppError.forbidden(
      `Your current plan (${subscription?.plan?.name ?? 'Plan'}) has reached the limit of ${resourceUsage.limit} ${resource}. Please upgrade your subscription plan to add more.`,
      'PLAN_LIMIT_REACHED',
    );
  }
}
