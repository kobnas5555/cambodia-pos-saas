import type {
  CreateRoleInput,
  UpdateRoleInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import { ensurePermissionsExist } from '../auth/auth.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listRoles(
  tenantId: string,
  options?: {
    search?: string;
    type?: 'ALL' | 'SYSTEM' | 'CUSTOM';
  } | string,
) {
  const opts = typeof options === 'string' ? { search: options } : (options ?? {});
  const { search, type } = opts;

  const roles = await prisma.role.findMany({
    where: {
      tenantId,
      ...(type === 'SYSTEM' ? { isSystem: true } : type === 'CUSTOM' ? { isSystem: false } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      rolePermissions: {
        include: { permission: true },
      },
      _count: { select: { userRoles: true } },
    },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });

  return roles.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    memberCount: r._count.userRoles,
    permissions: r.rolePermissions.map((rp) => rp.permission.code),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function createRole(
  tenantId: string,
  actor: ActorInfo,
  input: CreateRoleInput,
) {
  const existing = await prisma.role.findUnique({
    where: { tenantId_name: { tenantId, name: input.name } },
  });
  if (existing) {
    throw AppError.conflict(`Role "${input.name}" already exists`, 'ROLE_EXISTS');
  }

  return prisma.$transaction(async (tx) => {
    await ensurePermissionsExist(tx);
    const perms = await tx.permission.findMany({
      where: { code: { in: input.permissionCodes } },
    });

    if (perms.length === 0) {
      throw AppError.badRequest('No valid permission codes provided', 'INVALID_PERMISSIONS');
    }

    const role = await tx.role.create({
      data: {
        tenantId,
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
      },
    });

    await tx.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'role.created',
        module: 'roles',
        recordType: 'Role',
        recordId: role.id,
        newValues: { name: role.name, permissions: perms.map((p) => p.code) },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      ...role,
      permissions: perms.map((p) => p.code),
    };
  });
}

export async function updateRole(
  tenantId: string,
  roleId: string,
  actor: ActorInfo,
  input: UpdateRoleInput,
) {
  const existing = await prisma.role.findFirst({
    where: { id: roleId, tenantId },
    include: {
      rolePermissions: { include: { permission: { select: { code: true } } } },
    },
  });
  if (!existing) {
    throw AppError.notFound('Role not found', 'ROLE_NOT_FOUND');
  }
  if (existing.isSystem) {
    throw AppError.badRequest('System roles cannot be modified', 'SYSTEM_ROLE_PROTECTED');
  }

  return prisma.$transaction(async (tx) => {
    if (input.name && input.name !== existing.name) {
      const dup = await tx.role.findUnique({
        where: { tenantId_name: { tenantId, name: input.name } },
      });
      if (dup) {
        throw AppError.conflict(`Role "${input.name}" already exists`, 'ROLE_EXISTS');
      }
    }

    let nextPermissions = existing.rolePermissions.map((rp) => rp.permission.code);
    if (input.permissionCodes) {
      await ensurePermissionsExist(tx);
      const perms = await tx.permission.findMany({
        where: { code: { in: input.permissionCodes } },
      });
      if (perms.length === 0) {
        throw AppError.badRequest('No valid permission codes provided', 'INVALID_PERMISSIONS');
      }
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: perms.map((p) => ({ roleId, permissionId: p.id })),
      });
      nextPermissions = perms.map((p) => p.code);
    }

    const updated = await tx.role.update({
      where: { id: roleId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'role.updated',
        module: 'roles',
        recordType: 'Role',
        recordId: roleId,
        newValues: input,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      ...updated,
      permissions: nextPermissions,
    };
  });
}

export async function deleteRole(tenantId: string, roleId: string, actor: ActorInfo) {
  const existing = await prisma.role.findFirst({
    where: { id: roleId, tenantId },
    include: { _count: { select: { userRoles: true } } },
  });
  if (!existing) {
    throw AppError.notFound('Role not found', 'ROLE_NOT_FOUND');
  }
  if (existing.isSystem) {
    throw AppError.badRequest('System roles cannot be deleted', 'SYSTEM_ROLE_PROTECTED');
  }
  if (existing._count.userRoles > 0) {
    throw AppError.badRequest('Detach employees from this role before deleting it', 'ROLE_IN_USE');
  }

  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id: roleId } });
    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'role.deleted',
        module: 'roles',
        recordType: 'Role',
        recordId: roleId,
        oldValues: { name: existing.name },
        ipAddress: actor.ipAddress,
      },
      tx,
    );
  });
}

