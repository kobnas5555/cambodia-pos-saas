import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

export function requirePermission(...requiredCodes: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.tenant) {
      next(AppError.forbidden('Active tenant context is required'));
      return;
    }

    const hasAll = requiredCodes.every((code) => req.tenant!.permissions.has(code));
    if (!hasAll) {
      next(
        AppError.forbidden(
          `Missing required permission: ${requiredCodes.join(', ')}`,
          'PERMISSION_DENIED',
        ),
      );
      return;
    }

    next();
  };
}

