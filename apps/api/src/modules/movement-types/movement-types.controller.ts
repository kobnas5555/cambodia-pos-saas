import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as movementTypesService from './movement-types.service';

export const getMovementTypes = asyncHandler(async (req: Request, res: Response) => {
  const data = await movementTypesService.listMovementTypes(req.query as any);
  res.json({ success: true, data });
});

