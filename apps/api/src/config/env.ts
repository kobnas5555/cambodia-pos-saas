import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/cambodia_pos?schema=public'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16)
    .default('dev-access-secret-key-cambodia-pos-saas'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16)
    .default('dev-refresh-secret-key-cambodia-pos-saas'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
});

export const env = envSchema.parse(process.env);

