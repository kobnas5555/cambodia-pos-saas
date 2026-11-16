import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { AppError } from '../errors/AppError';
import { verifyAccessToken } from '../utils/jwt';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing or invalid Authorization header');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw AppError.unauthorized('Missing access token');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw AppError.unauthorized('Invalid or expired access token', 'INVALID_TOKEN');
    }

    const session = await prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            isPlatformAdmin: true,
          },
        },
      },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      throw AppError.unauthorized('Session is no longer active', 'SESSION_REVOKED');
    }

    if (session.user.status !== 'ACTIVE') {
      throw AppError.forbidden('User account is inactive', 'USER_INACTIVE');
    }

    req.auth = {
      userId: session.user.id,
      email: session.user.email,
      sessionId: session.id,
      tokenTenantId: payload.tenantId,
      isPlatformAdmin: session.user.isPlatformAdmin,
    };

    next();
  } catch (error) {
    next(error);
  }
}

