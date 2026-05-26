import * as fs from 'fs';
import * as path from 'path';
import { getDb } from './index';
import { logger } from '../utils/logger';

function applyAlterMigrations(db: any): void {
  // Додаємо нові колонки в існуючі таблиці (безпечно — ігноруємо якщо вже є)
  const alterations = [
    "ALTER TABLE users ADD COLUMN receive_all INTEGER DEFAULT 0",
    "ALTER TABLE message_sends ADD COLUMN telegram_message_ids TEXT",
  ];
  for (const sql of alterations) {
    try { db.exec(sql); } catch { /* колонка вже існує */ }
  }
}

export function runMigrations(): void {
  const db = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  db.exec(sql);
  applyAlterMigrations(db);
  logger.info('Database migrations completed');
}

if (require.main === module) {
  runMigrations();
  logger.info('Migration script finished');
  process.exit(0);
}
