import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '../constants/currencies';
import { BUSINESS_TYPES } from '../constants/permissions';
import { SUPPORTED_LANGUAGES } from '../i18n';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const branchCodeRegex = /^[A-Z0-9_-]{2,20}$/;

export function slugifyBusinessName(name: string): string {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'business';
}

export const registerBusinessSchema = z.object({
  ownerName: z.string().trim().min(2, 'Owner name must be at least 2 characters').max(120),
  email: z.string().trim().toLowerCase().email('Please provide a valid email address'),
  phone: z.string().trim().min(6, 'Phone number is required').max(30),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100)
    .regex(/[A-Za-z]/, 'Password must include at least one letter')
    .regex(/[0-9]/, 'Password must include at least one number'),
  businessName: z.string().trim().min(2, 'Business name must be at least 2 characters').max(140),
  businessSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(slugRegex, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .optional(),
  businessType: z.enum(BUSINESS_TYPES).default('RETAIL'),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  defaultLanguage: z.enum(SUPPORTED_LANGUAGES).default('en'),
  mainBranchName: z.string().trim().min(2, 'Main branch name is required').max(120).default('Main Branch'),
  mainBranchCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(branchCodeRegex, 'Branch code must be 2-20 uppercase letters, numbers, hyphens, or underscores')
    .default('MAIN'),
  branchAddress: z.string().trim().max(300).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  tenantSlug: z.string().trim().toLowerCase().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email is required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(16, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100)
    .regex(/[A-Za-z]/, 'Password must include at least one letter')
    .regex(/[0-9]/, 'Password must include at least one number'),
});

export const switchTenantSchema = z.object({
  tenantId: z.string().uuid('Valid tenantId is required'),
});

export type RegisterBusinessInput = z.infer<typeof registerBusinessSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;

