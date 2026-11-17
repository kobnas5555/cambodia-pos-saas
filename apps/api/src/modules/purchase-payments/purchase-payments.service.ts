import {
  addDecimals,
  compareDecimals,
  convertCurrency,
  type CreatePurchasePaymentInput,
  type CurrencyCode,
  type ListPurchasePaymentsQueryInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

function computePaymentStatus(paidAmount: string, totalAmount: string): 'UNPAID' | 'PARTIAL' | 'PAID' {
  const paid = Number(paidAmount);
  const total = Number(totalAmount);
  if (paid <= 0) return 'UNPAID';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

export async function listPurchasePayments(
  tenantId: string,
  filters: Partial<ListPurchasePaymentsQueryInput> | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    tenantId,
    ...(query.purchaseId ? { purchaseId: query.purchaseId } : {}),
    ...(query.paymentMethod && (query.paymentMethod as string) !== 'ALL' ? { paymentMethod: query.paymentMethod } : {}),
    ...(query.currencyCode ? { currencyCode: query.currencyCode } : {}),
    ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    ...(query.startDate || query.endDate
      ? {
          paidAt: {
            ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
            ...(query.endDate ? { lte: new Date(query.endDate + 'T23:59:59.999Z') } : {}),
          },
        }
      : {}),
    ...(query.branchId || query.supplierId
      ? {
          purchase: {
            ...(query.branchId ? { branchId: query.branchId } : {}),
            ...(query.supplierId ? { supplierId: query.supplierId } : {}),
          },
        }
      : {}),
  };

  if (query.search?.trim()) {
    const q = query.search.trim();
    where.OR = [
      { referenceNumber: { contains: q, mode: 'insensitive' } },
      { id: { contains: q, mode: 'insensitive' } },
      { purchase: { purchaseNumber: { contains: q, mode: 'insensitive' } } },
      { purchase: { supplier: { name: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  const total = await prisma.purchasePayment.count({ where });
  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const payments = await prisma.purchasePayment.findMany({
    where,
    include: {
      purchase: {
        select: {
          id: true,
          purchaseNumber: true,
          totalAmount: true,
          currencyCode: true,
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { paidAt: 'desc' },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });

  const totalPages = Math.ceil(total / (limit || 1)) || 1;

  return Object.assign(payments, {
    items: payments,
    total,
    page,
    limit,
    totalPages,
  });
}

export async function getPurchasePaymentById(tenantId: string, paymentId: string) {
  const payment = await prisma.purchasePayment.findFirst({
    where: { id: paymentId, tenantId },
    include: {
      purchase: {
        select: {
          id: true,
          purchaseNumber: true,
          totalAmount: true,
          currencyCode: true,
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!payment) {
    throw AppError.notFound('Purchase payment not found', 'PURCHASE_PAYMENT_NOT_FOUND');
  }
  return payment;
}

export async function recordPurchasePayment(
  tenantId: string,
  purchaseId: string,
  actor: ActorInfo,
  input: CreatePurchasePaymentInput,
) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id: purchaseId, tenantId },
    });
    if (!purchase) throw AppError.notFound('Purchase not found', 'PURCHASE_NOT_FOUND');

    const rate = input.exchangeRate ?? purchase.exchangeRate.toString();
    const amountInPurchaseCurrency = convertCurrency(
      input.amount,
      input.currencyCode as CurrencyCode,
      purchase.currencyCode as CurrencyCode,
      rate,
    );

    const nextPaid = addDecimals(purchase.paidAmount.toString(), amountInPurchaseCurrency, 2);
    if (compareDecimals(nextPaid, purchase.totalAmount.toString(), 2) > 0) {
      throw AppError.badRequest(
        'Payment exceeds remaining balance due on this purchase',
        'OVERPAYMENT',
      );
    }

    const payment = await tx.purchasePayment.create({
      data: {
        tenantId,
        purchaseId: purchase.id,
        amount: input.amount,
        currencyCode: input.currencyCode,
        exchangeRate: rate,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber ?? null,
        status: input.status ?? 'COMPLETED',
        ...(input.paidAt ? { paidAt: new Date(input.paidAt) } : {}),
      },
    });

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { paidAmount: nextPaid },
    });

    const oldPaymentStatus = computePaymentStatus(purchase.paidAmount.toString(), purchase.totalAmount.toString());
    const newPaymentStatus = computePaymentStatus(nextPaid, purchase.totalAmount.toString());

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'purchase_payment.recorded',
        module: 'purchasing',
        recordType: 'PurchasePayment',
        recordId: payment.id,
        newValues: { purchaseId, amount: input.amount, currencyCode: input.currencyCode, paymentStatus: newPaymentStatus },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    if (oldPaymentStatus !== newPaymentStatus) {
      await recordActivity(
        {
          tenantId,
          userId: actor.userId,
          employeeId: actor.employeeId,
          action: 'purchase.status_changed',
          module: 'purchasing',
          recordType: 'Purchase',
          recordId: purchase.id,
          oldValues: { paymentStatus: oldPaymentStatus, paidAmount: purchase.paidAmount.toString() },
          newValues: { paymentStatus: newPaymentStatus, paidAmount: nextPaid },
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    }

    return payment;
  });
}

