import type { CreateCustomerInput, UpdateCustomerInput } from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listCustomers(
  tenantId: string,
  filters: {
    search?: string;
    status?: string;
    page?: number | string;
    limit?: number | string;
  } | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    tenantId,
    ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { customerCode: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { address: { contains: query.search, mode: 'insensitive' } },
            { notes: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const total = await prisma.customer.count({ where });

  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const customers = await prisma.customer.findMany({
    where,
    include: {
      _count: { select: { orders: true } },
      orders: {
        select: {
          id: true,
          totalAmount: true,
          currencyCode: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });

  const totalPages = Math.ceil(total / (limit || 1)) || 1;

  return Object.assign(customers, {
    items: customers,
    total,
    page,
    limit,
    totalPages,
  });
}

export async function getCustomerById(tenantId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: {
          branch: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!customer) throw AppError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  return customer;
}

export async function createCustomer(
  tenantId: string,
  actor: ActorInfo,
  input: CreateCustomerInput,
) {
  return prisma.$transaction(async (tx) => {
    let code = input.customerCode?.trim().toUpperCase();
    if (!code) {
      const count = await tx.customer.count({ where: { tenantId } });
      code = `CUST-${String(count + 1).padStart(4, '0')}`;
      let suffix = 1;
      while (await tx.customer.findUnique({ where: { tenantId_customerCode: { tenantId, customerCode: code } } })) {
        code = `CUST-${String(count + 1 + suffix).padStart(4, '0')}`;
        suffix += 1;
      }
    } else {
      const dup = await tx.customer.findUnique({
        where: { tenantId_customerCode: { tenantId, customerCode: code } },
      });
      if (dup) {
        throw AppError.conflict(`Customer code "${code}" already exists in this workspace`, 'CUSTOMER_CODE_TAKEN');
      }
    }

    try {
      const customer = await tx.customer.create({
        data: {
          tenantId,
          customerCode: code,
          name: input.name.trim(),
          phone: input.phone ? input.phone.trim() : null,
          email: input.email ? input.email.trim().toLowerCase() : null,
          address: input.address ? input.address.trim() : null,
          notes: input.notes ? input.notes.trim() : null,
          status: 'ACTIVE',
        },
      });

      await recordActivity(
        {
          tenantId,
          userId: actor.userId,
          employeeId: actor.employeeId,
          action: 'customer.created',
          module: 'customers',
          recordType: 'Customer',
          recordId: customer.id,
          newValues: { customerCode: customer.customerCode, name: customer.name },
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return customer;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw AppError.conflict(`Customer code "${code}" already exists in this workspace`, 'CUSTOMER_CODE_TAKEN');
      }
      throw err;
    }
  });
}

export async function updateCustomer(
  tenantId: string,
  customerId: string,
  input: UpdateCustomerInput,
  actor?: ActorInfo,
) {
  const existing = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!existing) throw AppError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');

  if (input.customerCode && input.customerCode.trim().toUpperCase() !== existing.customerCode) {
    const dup = await prisma.customer.findUnique({
      where: { tenantId_customerCode: { tenantId, customerCode: input.customerCode.trim().toUpperCase() } },
    });
    if (dup) {
      throw AppError.conflict(
        `Customer code "${input.customerCode}" already exists in this workspace`,
        'CUSTOMER_CODE_TAKEN',
      );
    }
  }

  try {
    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(input.customerCode !== undefined ? { customerCode: input.customerCode.trim().toUpperCase() } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ? input.phone.trim() : null } : {}),
        ...(input.email !== undefined ? { email: input.email ? input.email.trim().toLowerCase() : null } : {}),
        ...(input.address !== undefined ? { address: input.address ? input.address.trim() : null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ? input.notes.trim() : null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    if (actor) {
      await recordActivity({
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'customer.updated',
        module: 'customers',
        recordType: 'Customer',
        recordId: customerId,
        oldValues: { name: existing.name, customerCode: existing.customerCode, status: existing.status },
        newValues: input,
        ipAddress: actor.ipAddress,
      });
    }

    return updated;
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw AppError.conflict(
        `Customer code "${input.customerCode}" already exists in this workspace`,
        'CUSTOMER_CODE_TAKEN',
      );
    }
    throw err;
  }
}

export async function deleteCustomer(
  tenantId: string,
  customerId: string,
  actor: ActorInfo,
  mode?: string,
) {
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    include: { _count: { select: { orders: true } } },
  });
  if (!existing) throw AppError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');

  const hasOrders = ((existing as any)._count?.orders ?? 0) > 0;

  if (hasOrders || mode !== 'permanent') {
    const archived = await prisma.customer.update({
      where: { id: customerId },
      data: { status: 'INACTIVE' },
    });
    await recordActivity({
      tenantId,
      userId: actor.userId,
      employeeId: actor.employeeId,
      action: 'customer.archived',
      module: 'customers',
      recordType: 'Customer',
      recordId: customerId,
      oldValues: { status: existing.status },
      newValues: { status: 'INACTIVE' },
      ipAddress: actor.ipAddress,
    });
    return archived;
  }

  const deleted = await prisma.customer.delete({
    where: { id: customerId },
  });
  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId: actor.employeeId,
    action: 'customer.deleted',
    module: 'customers',
    recordType: 'Customer',
    recordId: customerId,
    oldValues: { name: existing.name, customerCode: existing.customerCode },
    ipAddress: actor.ipAddress,
  });
  return deleted;
}

