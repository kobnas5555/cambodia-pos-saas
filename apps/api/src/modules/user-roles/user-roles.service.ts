import { prisma } from '../../db/prisma';

export async function listUserRoles(
  tenantId: string,
  options?: {
    tenantUserId?: string;
    roleId?: string;
    search?: string;
    page?: number;
    limit?: number;
  },
) {
  const page = Number(options?.page) > 0 ? Number(options?.page) : 1;
  const limit = options?.limit !== undefined ? Number(options?.limit) : 50;

  const where: any = {
    tenantUser: { tenantId },
    ...(options?.tenantUserId && options.tenantUserId !== 'ALL' ? { tenantUserId: options.tenantUserId } : {}),
    ...(options?.roleId && options.roleId !== 'ALL' ? { roleId: options.roleId } : {}),
    ...(options?.search
      ? {
          OR: [
            { role: { name: { contains: options.search, mode: 'insensitive' } } },
            { tenantUser: { user: { name: { contains: options.search, mode: 'insensitive' } } } },
            { tenantUser: { user: { email: { contains: options.search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const total = await prisma.userRole.count({ where });

  const items = await prisma.userRole.findMany({
    where,
    include: {
      role: { select: { id: true, name: true, isSystem: true } },
      tenantUser: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: [{ role: { name: 'asc' } }],
    skip: (page - 1) * limit,
    take: limit,
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    items,
    total,
    page,
    limit,
    totalPages,
  };
}

