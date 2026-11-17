import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';

export async function listUsers(
  tenantId: string,
  options?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  },
) {
  const page = Number(options?.page) > 0 ? Number(options?.page) : 1;
  const limit = options?.limit !== undefined ? Number(options?.limit) : 50;

  const where: any = {
    tenantUsers: {
      some: { tenantId },
    },
    ...(options?.status && options.status !== 'ALL' ? { status: options.status } : {}),
    ...(options?.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { email: { contains: options.search, mode: 'insensitive' } },
            { phone: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const total = await prisma.user.count({ where });

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      isPlatformAdmin: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      tenantUsers: {
        where: { tenantId },
        select: {
          id: true,
          status: true,
          joinedAt: true,
          userRoles: {
            select: {
              role: { select: { id: true, name: true, isSystem: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    items: users,
    total,
    page,
    limit,
    totalPages,
  };
}

export async function getUserById(tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantUsers: {
        some: { tenantId },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      isPlatformAdmin: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      tenantUsers: {
        where: { tenantId },
        select: {
          id: true,
          status: true,
          joinedAt: true,
          userRoles: {
            select: {
              role: { select: { id: true, name: true, isSystem: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw AppError.notFound('User not found in this tenant', 'USER_NOT_FOUND');
  }

  return user;
}

