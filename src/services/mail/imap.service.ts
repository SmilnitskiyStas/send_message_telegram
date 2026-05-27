import { ImapFlow } from 'imapflow';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getDb } from '../../db';
import { ParsedEmail } from '../../types';
import { parseRawEmail } from './parser.service';

export type NewMailHandler = (email: ParsedEmail) => Promise<void>;

export class ImapService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  constructor(private readonly onNewMail: NewMailHandler) {}

  start(): void {
    logger.info(
      { host: config.MAIL_HOST, user: config.MAIL_USER, intervalSec: config.MAIL_POLL_INTERVAL_SEC },
      'IMAP polling started',
    );
    this.pollOnce();
    this.pollTimer = setInterval(
      () => this.pollOnce(),
      config.MAIL_POLL_INTERVAL_SEC * 1000,
    );
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    logger.info('IMAP polling stopped');
  }

  private createClient(): ImapFlow {
    return new ImapFlow({
      host: config.MAIL_HOST,
      port: config.MAIL_PORT,
      secure: true,
      auth: {
        user: config.MAIL_USER,
        pass: config.MAIL_PASS,
      },
      logger: false,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  private isProcessed(uid: number): boolean {
    const db = getDb();
    const row = db.prepare('SELECT uid FROM processed_emails WHERE uid = ?').get([uid]);
    return !!row;
  }

  private markProcessed(uid: number, subject: string): void {
    const db = getDb();
    db.prepare(
      'INSERT OR IGNORE INTO processed_emails (uid, mail_subject) VALUES (?, ?)',
    ).run([uid, subject]);
  }

  private async pollOnce(): Promise<void> {
    if (this.isPolling) {
      logger.debug('Previous poll still running, skipping');
      return;
    }
    this.isPolling = true;

    const client = this.createClient();
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        // Шукаємо листи за останні 2 дні — незалежно від прапора \Seen
        // Це захищає від ситуації коли інша програма вже позначила листи як прочитані
        const since = new Date();
        since.setDate(since.getDate() - 2);

        let found = 0;
        let skipped = 0;
        let processed = 0;

        for await (const msg of client.fetch({ since }, { uid: true, source: true })) {
          if (!msg.source) continue;
          found++;

          // Пропускаємо вже оброблені (по UID в нашій БД)
          if (this.isProcessed(msg.uid)) {
            skipped++;
            continue;
          }

          try {
            const parsed = await parseRawEmail(msg.source);
            logger.info(
              { uid: msg.uid, subject: parsed.subject, from: parsed.from, attachments: parsed.attachments.length },
              'New email received',
            );

            await this.onNewMail(parsed);

            // Зберігаємо UID в нашій БД — більше не обробляємо цей лист
            this.markProcessed(msg.uid, parsed.subject);
            processed++;
          } catch (err) {
            logger.error({ err, uid: msg.uid }, 'Failed to process email');
          }
        }

        if (processed > 0) {
          logger.info({ found, skipped, processed }, 'Poll completed');
        } else {
          logger.debug({ found, skipped }, 'No new emails');
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err) {
      logger.error({ err }, 'IMAP poll error');
      try {
        await client.logout();
      } catch {
        // ignore logout errors
      }
    } finally {
      this.isPolling = false;
    }
  }
}
