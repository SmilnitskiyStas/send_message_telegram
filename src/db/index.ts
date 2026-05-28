import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Database } = require('node-sqlite3-wasm');

let db: any;

export function getDb(): any {
  if (!db) {
    const dbPath = path.resolve(config.DATABASE_PATH);
    const dir = path.dirname(dbPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Очищення lock-директорії яка залишається після падіння процесу
    const lockPath = dbPath + '.lock';
    if (fs.existsSync(lockPath)) {
      fs.rmSync(lockPath, { recursive: true, force: true });
      logger.warn({ lockPath }, 'Removed stale database lock directory');
    }

    db = new Database(dbPath);
    db.exec('PRAGMA busy_timeout = 10000');
    db.exec('PRAGMA foreign_keys = ON');

    logger.info({ dbPath }, 'Database connected');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    logger.info('Database connection closed');
  }
}

// ── Хелпери з авто-finalize ───────────────────────────────────────────────────
// node-sqlite3-wasm виділяє пам'ять у WASM heap і НЕ звільняє її автоматично.
// Кожен db.prepare() без .finalize() — leak. Використовуйте ці хелпери.

export function dbGet<T = any>(sql: string, params: any[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  try { return stmt.get(params) as T | undefined; }
  finally { stmt.finalize(); }
}

export function dbRun(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
  const stmt = getDb().prepare(sql);
  try { return stmt.run(params); }
  finally { stmt.finalize(); }
}

export function dbAll<T = any>(sql: string, params: any[] = []): T[] {
  const stmt = getDb().prepare(sql);
  try { return stmt.all(params) as T[]; }
  finally { stmt.finalize(); }
}
