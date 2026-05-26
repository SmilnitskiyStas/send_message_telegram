import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config({ override: true });

const envSchema = z.object({
  MAIL_HOST: z.string().min(1),
  MAIL_PORT: z.coerce.number().default(993),
  MAIL_USER: z.string().email(),
  MAIL_PASS: z.string().min(1),
  MAIL_POLL_INTERVAL_SEC: z.coerce.number().default(30),

  TELEGRAM_BOT_TOKEN: z.string().transform(v => v || undefined).optional(),

  DATABASE_PATH: z.string().default('./data/mailbot.db'),

  PORT: z.coerce.number().default(3000),
  ADMIN_PASSWORD: z.string().min(1).default('change_me_please'),

  STORE_DETECTION_PATTERN: z.string().default('магазин|store|shop'),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
