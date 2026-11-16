import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../errors/AppError';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (error) {
      const maybeZod = error as { name?: string; issues?: Array<{ path: (string | number)[]; message: string }> };
      if (
        error instanceof ZodError ||
        (typeof error === 'object' && error !== null && maybeZod.name === 'ZodError' && Array.isArray(maybeZod.issues))
      ) {
        const issues = error instanceof ZodError ? error.issues : maybeZod.issues!;
        const formatted = issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        next(
          AppError.badRequest(
            formatted[0]?.message || 'Validation failed',
            'VALIDATION_ERROR',
            formatted,
          ),
        );
        return;
      }
      next(error);
    }
  };
}

