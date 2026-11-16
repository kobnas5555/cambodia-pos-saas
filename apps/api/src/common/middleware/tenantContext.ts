import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { AppError } from '../errors/AppError';

const uuidSchema = z.string().uuid();

export async function requireTenantContext(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      throw AppError.unauthorized();
    }

    const headerTenantId = req.headers['x-tenant-id'];
    const requestedTenantId =
      typeof headerTenantId === 'string' && headerTenantId.trim().length > 0
        ? headerTenantId.trim()
        : req.auth.tokenTenantId;

    if (!requestedTenantId) {
      throw AppError.badRequest('Active tenant context is required', 'TENANT_REQUIRED');
    }

    const parsed = uuidSchema.safeParse(requestedTenantId);
    if (!parsed.success) {
      throw AppError.badRequest('Invalid X-Tenant-Id format', 'INVALID_TENANT_ID');
    }

    const tenantUser = await prisma.tenantUser.findUnique({
      where: {
        tenantId_userId: {
          tenantId: parsed.data,
          userId: req.auth.userId,
        },
      },
      include: {
        tenant: {
          select: {
            id: true,
            status: true,
          },
        },
        employees: {
          where: { status: 'ACTIVE' },
          select: { id: true },
          take: 1,
        },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: {
                      select: { code: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!tenantUser || tenantUser.status !== 'ACTIVE') {
      throw AppError.forbidden(
        'Access denied for the requested business workspace',
        'TENANT_ACCESS_DENIED',
      );
    }

    if (tenantUser.tenant.status !== 'ACTIVE') {
      throw AppError.forbidden('Business workspace is not active', 'TENANT_INACTIVE');
    }

    const permissions = new Set<string>();
    for (const userRole of tenantUser.userRoles) {
      for (const rp of userRole.role.rolePermissions) {
        permissions.add(rp.permission.code);
      }
    }

    req.tenant = {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      employeeId: tenantUser.employees[0]?.id ?? null,
      permissions,
    };

    next();
  } catch (error) {
    next(error);
  }
}

