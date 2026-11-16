import type {
  AcceptInvitationInput,
  CreateEmployeeInput,
  CreateRoleInput,
  InviteEmployeeInput,
  UpdateEmployeeInput,
  UpdateRoleInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { hashPassword } from '../../common/utils/password';
import { generateOpaqueToken, hashOpaqueToken } from '../../common/utils/tokens';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import { ensurePermissionsExist } from '../auth/auth.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listPermissions(options?: { search?: string; module?: string }) {
  const { search, module } = options ?? {};
  return prisma.$transaction(async (tx) => {
    await ensurePermissionsExist(tx);
    return tx.permission.findMany({
      where: {
        ...(module && module !== 'ALL' ? { module } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { module: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
  });
}

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

export async function listEmployees(
  tenantId: string,
  options?: {
    search?: string;
    status?: string;
    branchId?: string;
    page?: number;
    limit?: number;
  } | string,
) {
  const opts = typeof options === 'string' ? { search: options } : (options ?? {});
  const { search, status, branchId } = opts;
  const page = Number(opts.page) > 0 ? Number(opts.page) : 1;
  const limit = opts.limit !== undefined ? Number(opts.limit) : undefined;

  const where: any = {
    tenantId,
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(branchId && branchId !== 'ALL'
      ? {
          branchAccess: {
            some: { branchId },
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { employeeCode: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { position: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const total = await prisma.employee.count({ where });

  const employees = await prisma.employee.findMany({
    where,
    include: {
      branchAccess: {
        include: { branch: { select: { id: true, name: true, branchCode: true } } },
      },
      tenantUser: {
        include: {
          userRoles: {
            include: { role: { select: { id: true, name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    ...(limit ? { skip: (page - 1) * limit, take: limit } : {}),
  });

  const items = employees.map((e) => ({
    id: e.id,
    tenantId: e.tenantId,
    tenantUserId: e.tenantUserId,
    employeeCode: e.employeeCode,
    name: e.name,
    phone: e.phone,
    email: e.email,
    position: e.position,
    hireDate: e.hireDate,
    status: e.status,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    branches: e.branchAccess.map((ba) => ba.branch),
    roles: e.tenantUser?.userRoles.map((ur) => ur.role) ?? [],
    hasLoginAccount: Boolean(e.tenantUserId),
  }));

  const effectiveLimit = limit ?? (total > 0 ? total : 20);
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));

  return {
    items,
    total,
    page,
    limit: effectiveLimit,
    totalPages,
  };
}

export async function createEmployee(
  tenantId: string,
  actor: ActorInfo,
  input: CreateEmployeeInput,
) {
  const dup = await prisma.employee.findUnique({
    where: { tenantId_employeeCode: { tenantId, employeeCode: input.employeeCode } },
  });
  if (dup) {
    throw AppError.conflict(`Employee code "${input.employeeCode}" already exists`, 'EMPLOYEE_CODE_TAKEN');
  }

  return prisma.$transaction(async (tx) => {
    let tenantUserId: string | null = null;

    if (input.createUserAccount) {
      if (!input.email || !input.password) {
        throw AppError.badRequest(
          'Email and password are required when creating a login account',
          'ACCOUNT_FIELDS_REQUIRED',
        );
      }

      let user = await tx.user.findUnique({ where: { email: input.email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            phone: input.phone ?? null,
            passwordHash: await hashPassword(input.password),
            status: 'ACTIVE',
          },
        });
      }

      const existingMembership = await tx.tenantUser.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
      });

      const membership =
        existingMembership ??
        (await tx.tenantUser.create({
          data: { tenantId, userId: user.id, status: 'ACTIVE' },
        }));

      tenantUserId = membership.id;

      if (input.roleId) {
        const role = await tx.role.findFirst({ where: { id: input.roleId, tenantId } });
        if (!role) throw AppError.notFound('Role not found in this tenant', 'ROLE_NOT_FOUND');

        const existingUr = await tx.userRole.findUnique({
          where: { tenantUserId_roleId: { tenantUserId: membership.id, roleId: role.id } },
        });
        if (!existingUr) {
          await tx.userRole.create({
            data: { tenantUserId: membership.id, roleId: role.id },
          });
        }
      }
    }

    const employee = await tx.employee.create({
      data: {
        tenantId,
        tenantUserId,
        employeeCode: input.employeeCode,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        position: input.position ?? null,
        hireDate: input.hireDate ? new Date(input.hireDate) : new Date(),
        status: 'ACTIVE',
      },
    });

    if (input.branchIds.length > 0) {
      const validBranches = await tx.branch.findMany({
        where: { tenantId, id: { in: input.branchIds } },
        select: { id: true },
      });
      await tx.employeeBranchAccess.createMany({
        data: validBranches.map((b) => ({ employeeId: employee.id, branchId: b.id })),
      });
    }

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'employee.created',
        module: 'employees',
        recordType: 'Employee',
        recordId: employee.id,
        newValues: { employeeCode: employee.employeeCode, name: employee.name },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return employee;
  });
}

export async function updateEmployee(
  tenantId: string,
  employeeId: string,
  actor: ActorInfo,
  input: UpdateEmployeeInput,
) {
  const existing = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
  });
  if (!existing) {
    throw AppError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
  }

  if (input.status === 'INACTIVE' && actor.employeeId && actor.employeeId === employeeId) {
    throw AppError.badRequest(
      'You cannot deactivate your own active account',
      'CANNOT_DEACTIVATE_SELF',
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        ...(input.employeeCode !== undefined ? { employeeCode: input.employeeCode } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.hireDate !== undefined ? { hireDate: input.hireDate ? new Date(input.hireDate) : null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    if (input.branchIds !== undefined) {
      const validBranches = await tx.branch.findMany({
        where: { tenantId, id: { in: input.branchIds } },
        select: { id: true },
      });
      await tx.employeeBranchAccess.deleteMany({ where: { employeeId } });
      if (validBranches.length > 0) {
        await tx.employeeBranchAccess.createMany({
          data: validBranches.map((b) => ({ employeeId, branchId: b.id })),
        });
      }
    }

    if (input.roleIds !== undefined && existing.tenantUserId) {
      const validRoles = await tx.role.findMany({
        where: { tenantId, id: { in: input.roleIds } },
        select: { id: true },
      });
      await tx.userRole.deleteMany({ where: { tenantUserId: existing.tenantUserId } });
      if (validRoles.length > 0) {
        await tx.userRole.createMany({
          data: validRoles.map((r) => ({
            tenantUserId: existing.tenantUserId!,
            roleId: r.id,
          })),
        });
      }
    }

    if (input.status !== undefined && existing.tenantUserId) {
      const updatedTenantUser = await tx.tenantUser.update({
        where: { id: existing.tenantUserId },
        data: { status: input.status },
      });

      if (input.status === 'INACTIVE') {
        await tx.userSession.updateMany({
          where: {
            userId: updatedTenantUser.userId,
            tenantId,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      }
    }

    const isStatusChanged = input.status !== undefined && input.status !== existing.status;
    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: isStatusChanged ? 'employee.status_changed' : 'employee.updated',
        module: 'employees',
        recordType: 'Employee',
        recordId: employeeId,
        oldValues: {
          name: existing.name,
          position: existing.position,
          status: existing.status,
        },
        newValues: input,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return updated;
  });
}

export async function listInvitations(tenantId: string) {
  return prisma.tenantInvitation.findMany({
    where: { tenantId },
    include: {
      role: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function inviteEmployee(
  tenantId: string,
  actor: ActorInfo,
  input: InviteEmployeeInput,
) {
  const role = await prisma.role.findFirst({ where: { id: input.roleId, tenantId } });
  if (!role) {
    throw AppError.notFound('Role not found', 'ROLE_NOT_FOUND');
  }

  const rawToken = generateOpaqueToken(24);
  const tokenHash = hashOpaqueToken(rawToken);

  const invitation = await prisma.tenantInvitation.create({
    data: {
      tenantId,
      email: input.email,
      roleId: role.id,
      invitedByUserId: actor.userId,
      tokenHash,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    include: { role: { select: { id: true, name: true } } },
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId: actor.employeeId,
    action: 'employee.invited',
    module: 'employees',
    recordType: 'TenantInvitation',
    recordId: invitation.id,
    newValues: { email: input.email, role: role.name },
    ipAddress: actor.ipAddress,
  });

  return {
    invitation,
    ...(env.NODE_ENV !== 'production' ? { devInviteToken: rawToken } : {}),
  };
}

export async function acceptInvitation(input: AcceptInvitationInput) {
  const tokenHash = hashOpaqueToken(input.token);
  const invite = await prisma.tenantInvitation.findUnique({
    where: { tokenHash },
    include: { tenant: true },
  });

  if (!invite || invite.status !== 'PENDING' || invite.expiresAt <= new Date()) {
    throw AppError.badRequest('Invalid or expired invitation token', 'INVALID_INVITATION');
  }

  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      if (!input.password || !input.name) {
        throw AppError.badRequest(
          'Name and password are required to activate your new account',
          'ACCOUNT_DETAILS_REQUIRED',
        );
      }
      user = await tx.user.create({
        data: {
          name: input.name,
          email: invite.email,
          phone: input.phone ?? null,
          passwordHash: await hashPassword(input.password),
          status: 'ACTIVE',
        },
      });
    }

    const existingTu = await tx.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
    });

    const tenantUser = existingTu
      ? existingTu.status === 'ACTIVE'
        ? existingTu
        : await tx.tenantUser.update({
            where: { id: existingTu.id },
            data: { status: 'ACTIVE' },
          })
      : await tx.tenantUser.create({
          data: { tenantId: invite.tenantId, userId: user.id, status: 'ACTIVE' },
        });

    const hasRole = await tx.userRole.findUnique({
      where: { tenantUserId_roleId: { tenantUserId: tenantUser.id, roleId: invite.roleId } },
    });
    if (!hasRole) {
      await tx.userRole.create({
        data: { tenantUserId: tenantUser.id, roleId: invite.roleId },
      });
    }

    const existingEmp = await tx.employee.findFirst({
      where: { tenantId: invite.tenantId, tenantUserId: tenantUser.id },
    });
    if (!existingEmp) {
      const count = await tx.employee.count({ where: { tenantId: invite.tenantId } });
      const createdEmp = await tx.employee.create({
        data: {
          tenantId: invite.tenantId,
          tenantUserId: tenantUser.id,
          employeeCode: `EMP-${String(count + 1).padStart(3, '0')}`,
          name: user.name,
          email: user.email,
          phone: user.phone,
          position: 'Staff',
          hireDate: new Date(),
          status: 'ACTIVE',
        },
      });

      const mainBranch = await tx.branch.findFirst({
        where: { tenantId: invite.tenantId, status: 'ACTIVE' },
        orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
      });
      if (mainBranch) {
        await tx.employeeBranchAccess.create({
          data: { employeeId: createdEmp.id, branchId: mainBranch.id },
        });
      }
    } else if (existingEmp.status !== 'ACTIVE') {
      await tx.employee.update({
        where: { id: existingEmp.id },
        data: { status: 'ACTIVE' },
      });
    }

    await tx.tenantInvitation.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    return {
      tenantId: invite.tenantId,
      tenantName: invite.tenant.name,
      email: user.email,
    };
  });
}

