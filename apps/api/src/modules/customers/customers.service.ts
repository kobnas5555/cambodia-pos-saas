import type { CreateCustomerInput, UpdateCustomerInput } from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listCustomers(tenantId: string, search?: string) {
  return prisma.customer.findMany({
    where: {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { customerCode: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
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
    const count = await tx.customer.count({ where: { tenantId } });
    const code = input.customerCode || `CUST-${String(count + 1).padStart(4, '0')}`;

    const dup = await tx.customer.findUnique({
      where: { tenantId_customerCode: { tenantId, customerCode: code } },
    });
    if (dup) {
      throw AppError.conflict(`Customer code "${code}" already exists`, 'CUSTOMER_CODE_TAKEN');
    }

    const customer = await tx.customer.create({
      data: {
        tenantId,
        customerCode: code,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
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
  });
}

export async function updateCustomer(
  tenantId: string,
  customerId: string,
  input: UpdateCustomerInput,
) {
  const existing = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!existing) throw AppError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}

