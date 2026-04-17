import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  DB_HOST:     z.string().default('localhost'),
  DB_PORT:     z.coerce.number().default(3306),
  DB_USER:     z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME:     z.string().default('pulse'),
  JWT_SECRET:  z.string().min(32),
  // AWS / S3
  AWS_ACCESS_KEY_ID:     z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION:            z.string().default('us-east-2'),
  S3_BUCKET:             z.string().optional(),
  // External APIs
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY:    z.string().optional(),
  USDA_API_KEY:      z.string().optional(),
  // Server
  PORT:        z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
