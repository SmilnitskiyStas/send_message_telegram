import { getDb } from '../../db';
import { logger } from '../../utils/logger';
import { sendNotification } from '../telegram/bot.service';
import { detectStore, parseEncodingDevice } from '../mail/store-detector';
import { extractPlainText } from '../mail/parser.service';
import { ParsedEmail, User, Store } from '../../types';

interface SendRecord {
  user: User;
  role: string;
  ok: boolean;
  messageIds?: number[];
  error?: string;
}

async function sendToUser(
  user: User,
  email: ParsedEmail,
  storeName: string | null,
): Promise<{ ok: boolean; messageIds?: number[]; error?: string }> {
  try {
    const messageIds = await sendNotification(user.telegram_chat_id!, email, storeName);
    logger.info(
      { userId: user.id, chatId: user.telegram_chat_id, role: user.role,
        name: `${user.last_name} ${user.first_name}`, receiveAll: !!user.receive_all },
      'Notification sent',
    );
    return { ok: true, messageIds };
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    logger.error(
      { err, userId: user.id, chatId: user.telegram_chat_id,
        name: `${user.last_name} ${user.first_name}` },
      'Failed to send notification',
    );
    return { ok: false, error: errMsg };
  }
}

function logSends(logId: number, records: SendRecord[], storeName: string | null): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO message_sends
      (log_id, user_id, user_full_name, chat_id, role, store_name, status, error_message, telegram_message_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of records) {
    const fullName = `${r.user.last_name} ${r.user.first_name}${r.user.middle_name ? ' ' + r.user.middle_name : ''}`;
    stmt.run([
      logId,
      r.user.id,
      fullName,
      r.user.telegram_chat_id,
      r.role,
      storeName,
      r.ok ? 'sent' : 'failed',
      r.error ?? null,
      r.messageIds ? JSON.stringify(r.messageIds) : null,
    ]);
  }
}

export async function dispatchNotification(email: ParsedEmail): Promise<void> {
  const db = getDb();
  const plainText = extractPlainText(email);
  const { cameraNumber } = parseEncodingDevice(plainText);

  const store: Store | null = detectStore(email.subject, plainText);
  const storeName = store?.name ?? null;
  const storeId   = store?.id ?? null;

  // 1. Охорона конкретного магазину
  const storeSecurityUsers: User[] = storeId
    ? db.prepare(`
        SELECT * FROM users
        WHERE store_id = ? AND role = 'security' AND is_active = 1 AND telegram_chat_id IS NOT NULL
      `).all([storeId])
    : [];

  // 2. Охорона з receive_all=1 (всі магазини), яких ще немає в списку вище
  const storeSecurityIds = new Set(storeSecurityUsers.map(u => u.id));
  const globalSecurityUsers: User[] = (db.prepare(`
    SELECT * FROM users
    WHERE role = 'security' AND receive_all = 1 AND is_active = 1 AND telegram_chat_id IS NOT NULL
  `).all([]) as User[]).filter(u => !storeSecurityIds.has(u.id));

  // 3. Інші співробітники магазину (employee)
  const employeeUsers: User[] = storeId
    ? db.prepare(`
        SELECT * FROM users
        WHERE store_id = ? AND role = 'employee' AND is_active = 1 AND telegram_chat_id IS NOT NULL
      `).all([storeId])
    : [];

  logger.info({
    storeId, storeName, cameraNumber,
    storeSecurity: storeSecurityUsers.length,
    globalSecurity: globalSecurityUsers.length,
    employees: employeeUsers.length,
  }, 'Dispatching notification');

  const records: SendRecord[] = [];

  // Порядок: охорона магазину → глобальна охорона → співробітники магазину
  for (const user of storeSecurityUsers) {
    const res = await sendToUser(user, email, storeName);
    records.push({ user, role: 'security', ok: res.ok, messageIds: res.messageIds, error: res.error });
  }
  for (const user of globalSecurityUsers) {
    const res = await sendToUser(user, email, storeName);
    records.push({ user, role: 'security_global', ok: res.ok, messageIds: res.messageIds, error: res.error });
  }
  for (const user of employeeUsers) {
    const res = await sendToUser(user, email, storeName);
    records.push({ user, role: 'employee', ok: res.ok, messageIds: res.messageIds, error: res.error });
  }

  const notifiedIds  = records.filter(r => r.ok).map(r => r.user.id);
  const failedCount  = records.filter(r => !r.ok).length;
  const total = storeSecurityUsers.length + globalSecurityUsers.length + employeeUsers.length;

  const status =
    total === 0              ? 'no_recipients' :
    notifiedIds.length === 0 ? 'failed'        : 'sent';

  const logResult = db.prepare(`
    INSERT INTO notification_log
      (mail_subject, mail_from, mail_received_at, store_id, users_notified, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run([
    email.subject, email.from, email.date.toISOString(),
    storeId, JSON.stringify(notifiedIds), status,
  ]);

  const logId = Number(logResult.lastInsertRowid);
  if (records.length > 0) logSends(logId, records, storeName);

  logger.info(
    { logId, notified: notifiedIds.length, failed: failedCount, status, storeName, cameraNumber },
    'Dispatch completed',
  );
}
