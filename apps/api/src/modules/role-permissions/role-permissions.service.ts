import { prisma } from '../../db/prisma';

export async function listRolePermissions(
  tenantId: string,
  options?: {
    roleId?: string;
    permissionId?: string;
    search?: string;
    page?: number;
    limit?: number;
  },
) {
  const { roleId, permissionId, search } = options ?? {};
  const page = Number(options?.page) > 0 ? Number(options?.page) : 1;
  const limit = options?.limit !== undefined ? Number(options?.limit) : undefined;

  const where: any = {
    role: { tenantId },
    ...(roleId && roleId !== 'ALL' ? { roleId } : {}),
    ...(permissionId && permissionId !== 'ALL' ? { permissionId } : {}),
    ...(search
      ? {
          OR: [
            { role: { name: { contains: search, mode: 'insensitive' } } },
            { permission: { code: { contains: search, mode: 'insensitive' } } },
            { permission: { module: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const total = await prisma.rolePermission.count({ where });

  const rolePermissions = await prisma.rolePermission.findMany({
    where,
    include: {
      role: { select: { id: true, name: true, isSystem: true } },
      permission: { select: { id: true, code: true, module: true, description: true } },
    },
    ...(limit ? { skip: (page - 1) * limit, take: limit } : {}),
  });

  const items = rolePermissions.map((rp) => ({
    id: rp.id,
    roleId: rp.roleId,
    permissionId: rp.permissionId,
    role: rp.role,
    permission: rp.permission,
  }));

  const effectiveLimit = limit ?? (total > 0 ? total : 50);
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));

  return {
    items,
    total,
    page,
    limit: effectiveLimit,
    totalPages,
  };
}

