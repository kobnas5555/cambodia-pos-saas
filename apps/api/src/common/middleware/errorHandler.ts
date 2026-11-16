import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { AppError } from '../errors/AppError';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: {
          code: 'UNIQUE_CONSTRAINT',
          message: 'A record with this unique value already exists.',
          ...(env.NODE_ENV !== 'production' ? { meta: err.meta } : {}),
        },
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          code: 'RECORD_NOT_FOUND',
          message: 'Requested record was not found.',
        },
      });
      return;
    }
  }

  if (env.NODE_ENV !== 'test') {
    console.error('Unhandled error:', err);
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
}

