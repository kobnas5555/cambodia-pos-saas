import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as authService from './auth.service';

function getRequestMetadata(req: Request) {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

export const registerBusiness = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerBusiness(req.body, getRequestMetadata(req));
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.loginUser(req.body, getRequestMetadata(req));
  res.json({ success: true, data: result });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.refreshAccessToken(req.body);
  res.json({ success: true, data: tokens });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logoutSession(req.auth!.sessionId);
  res.json({ success: true, message: 'Signed out successfully' });
});

export const getSessions = asyncHandler(async (req: Request, res: Response) => {
  const sessions = await authService.listUserSessions(req.auth!.userId, req.auth!.sessionId);
  res.json({ success: true, data: sessions });
});

export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  await authService.revokeUserSession(req.auth!.userId, req.params.sessionId);
  res.json({ success: true, message: 'Session revoked successfully' });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.requestPasswordReset(req.body);
  res.json({ success: true, data: result });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetUserPassword(req.body);
  res.json({ success: true, message: 'Password updated successfully' });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const headerTenantId = req.headers['x-tenant-id'];
  const preferredTenantId =
    typeof headerTenantId === 'string' && headerTenantId.trim().length > 0
      ? headerTenantId.trim()
      : req.auth!.tokenTenantId;

  const profile = await authService.getAuthenticatedProfile(req.auth!.userId, preferredTenantId);
  res.json({ success: true, data: profile });
});

export const switchTenant = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.switchActiveTenant(
    req.auth!.userId,
    req.auth!.sessionId,
    req.body.tenantId,
  );
  res.json({ success: true, data: result });
});

