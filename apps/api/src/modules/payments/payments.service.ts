import type { ListPaymentsQueryInput } from '@cambodia-pos/shared';
import { prisma } from '../../db/prisma';

export async function listPayments(
  tenantId: string,
  options?: Partial<ListPaymentsQueryInput> & {
    branchId?: string;
    orderId?: string;
    paymentMethod?: string;
    currencyCode?: string;
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number | string;
    limit?: number | string;
  },
) {
  const query = options || {};
  const page = Math.max(1, Number(query.page) || 1);
  const take = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * take;

  const where: any = {
    tenantId,
    ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
    ...(query.currencyCode ? { currencyCode: query.currencyCode } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(query.branchId ? { order: { branchId: query.branchId } } : {}),
  };

  if (query.startDate || query.endDate) {
    where.paidAt = {};
    if (query.startDate) where.paidAt.gte = new Date(query.startDate);
    if (query.endDate) where.paidAt.lte = new Date(query.endDate);
  }

  if (query.search?.trim()) {
    const s = query.search.trim();
    where.OR = [
      { referenceNumber: { contains: s, mode: 'insensitive' } },
      { paymentMethod: { contains: s, mode: 'insensitive' } },
      { order: { orderNumber: { contains: s, mode: 'insensitive' } } },
      { order: { branch: { name: { contains: s, mode: 'insensitive' } } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            currencyCode: true,
            totalAmount: true,
            status: true,
            branch: { select: { id: true, name: true, branchCode: true } },
            cashierEmployee: { select: { id: true, name: true, employeeCode: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      skip,
      take,
    }),
    prisma.payment.count({ where }),
  ]);

  const totalPages = Math.ceil(total / take) || 1;
  return Object.assign(items, {
    items,
    total,
    page,
    limit: take,
    totalPages,
  });
}

