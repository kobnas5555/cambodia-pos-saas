import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '../constants/currencies';
import { BUSINESS_TYPES } from '../constants/permissions';
import { SUPPORTED_LANGUAGES } from '../i18n';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const branchCodeRegex = /^[A-Z0-9_-]{2,20}$/;

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  phone: z.string().trim().min(6).max(30).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  logoUrl: z.string().trim().url().nullable().optional(),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES).optional(),
  defaultLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  timezone: z.string().trim().min(2).max(80).optional(),
});

export const createTenantSchema = z.object({
  businessName: z.string().trim().min(2).max(140),
  businessSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(slugRegex, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .optional(),
  businessType: z.enum(BUSINESS_TYPES).default('RETAIL'),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  address: z.string().trim().max(300).optional(),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  defaultLanguage: z.enum(SUPPORTED_LANGUAGES).default('en'),
  mainBranchName: z.string().trim().min(2).max(120).default('Main Branch'),
  mainBranchCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(branchCodeRegex, 'Branch code must be 2-20 uppercase letters, numbers, hyphens, or underscores')
    .default('MAIN'),
});

export const createBranchSchema = z.object({
  name: z.string().trim().min(2, 'Branch name must be at least 2 characters').max(120),
  branchCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(branchCodeRegex, 'Branch code must be 2-20 uppercase letters, numbers, hyphens, or underscores'),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  isMain: z.boolean().default(false),
});

export const updateBranchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  branchCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(branchCodeRegex, 'Branch code must be 2-20 uppercase letters, numbers, hyphens, or underscores')
    .optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  isMain: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const listBranchesQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type ListBranchesQuery = z.infer<typeof listBranchesQuerySchema>;

