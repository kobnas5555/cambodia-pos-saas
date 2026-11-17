import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as permissionsService from './permissions.service';

export const getPermissions = asyncHandler(async (req: Request, res: Response) => {
  const data = await permissionsService.listPermissions(req.query as any);
  res.json({ success: true, data });
});

