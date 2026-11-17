import type {
  AcceptInvitationInput,
  InviteEmployeeInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { hashPassword } from '../../common/utils/password';
import { generateOpaqueToken, hashOpaqueToken } from '../../common/utils/tokens';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listTenantUsers(
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
    tenantId,
    ...(options?.status && options.status !== 'ALL' ? { status: options.status } : {}),
    ...(options?.search
      ? {
          user: {
            OR: [
              { name: { contains: options.search, mode: 'insensitive' } },
              { email: { contains: options.search, mode: 'insensitive' } },
              { phone: { contains: options.search, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };

  const total = await prisma.tenantUser.count({ where });

  const items = await prisma.tenantUser.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          lastLoginAt: true,
        },
      },
      userRoles: {
        include: {
          role: { select: { id: true, name: true, isSystem: true } },
        },
      },
      employees: {
        select: {
          id: true,
          employeeCode: true,
          name: true,
          position: true,
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
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

export async function getTenantUserById(tenantId: string, id: string) {
  const tenantUser = await prisma.tenantUser.findFirst({
    where: { id, tenantId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          lastLoginAt: true,
        },
      },
      userRoles: {
        include: {
          role: { select: { id: true, name: true, isSystem: true } },
        },
      },
      employees: {
        select: {
          id: true,
          employeeCode: true,
          name: true,
          position: true,
        },
      },
    },
  });

  if (!tenantUser) {
    throw AppError.notFound('Tenant user membership not found', 'TENANT_USER_NOT_FOUND');
  }

  return tenantUser;
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

