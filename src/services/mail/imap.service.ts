import { ImapFlow } from 'imapflow';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { dbGet, dbRun } from '../../db';
import { ParsedEmail } from '../../types';
import { parseRawEmail } from './parser.service';

export type NewMailHandler = (email: ParsedEmail) => Promise<void>;

interface FetchedEmail {
  uid: number;
  parsed: ParsedEmail;
}

export class ImapService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;      // блокує тільки IMAP-фазу
  private isDispatching = false;  // інформаційний прапор (не блокує новий poll)

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
    return !!dbGet('SELECT uid FROM processed_emails WHERE uid = ?', [uid]);
  }

  private markProcessed(uid: number, subject: string): void {
    dbRun('INSERT OR IGNORE INTO processed_emails (uid, mail_subject) VALUES (?, ?)', [uid, subject]);
  }

  // ─── Фаза 1: IMAP ────────────────────────────────────────────────────────────
  // Підключається, парсить нові листи, мітить прочитаними, відключається.
  // isPolling = true ТІЛЬКИ протягом цієї фази (секунди).
  private async fetchNewEmails(): Promise<FetchedEmail[]> {
    const fetched: FetchedEmail[] = [];
    const client = this.createClient();

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const since = new Date();
        since.setDate(since.getDate() - 2);

        let found = 0, skipped = 0;

        for await (const msg of client.fetch({ since }, { uid: true, source: true })) {
          if (!msg.source) continue;
          found++;

          if (this.isProcessed(msg.uid)) { skipped++; continue; }

          try {
            const parsed = await parseRawEmail(msg.source);
            fetched.push({ uid: msg.uid, parsed });
            logger.info(
              { uid: msg.uid, subject: parsed.subject, from: parsed.from, attachments: parsed.attachments.length },
              'New email fetched',
            );
          } catch (err) {
            logger.error({ err, uid: msg.uid }, 'Failed to parse email');
          }
        }

        // Одразу мітимо прочитаними всі нові листи (поки з'єднання відкрите)
        for (const { uid } of fetched) {
          try {
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
          } catch (flagErr) {
            logger.warn({ flagErr, uid }, 'Could not mark email as read');
          }
        }

        logger.debug({ found, skipped, newEmails: fetched.length }, 'IMAP fetch completed');
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err) {
      logger.error({ err }, 'IMAP poll error');
      try { await client.logout(); } catch { /* ignore */ }
    }

    return fetched;
  }

  // ─── Фаза 2: Dispatch ────────────────────────────────────────────────────────
  // Відправляє в Telegram. Виконується ПІСЛЯ того як isPolling знятий,
  // тому наступний poll може стартувати не чекаючи завершення відправки.
  private async dispatchEmails(emails: FetchedEmail[]): Promise<void> {
    this.isDispatching = true;
    let processed = 0;

    for (const { uid, parsed } of emails) {
      // Зберігаємо в БД одразу — щоб повторний poll не взяв той самий лист
      this.markProcessed(uid, parsed.subject);
      try {
        await this.onNewMail(parsed);
        processed++;
      } catch (err) {
        logger.error({ err, uid }, 'Failed to dispatch notification');
      }
    }

    if (processed > 0) {
      logger.info({ processed }, 'Dispatch completed');
    }
    this.isDispatching = false;
  }

  // ─── Основний цикл ───────────────────────────────────────────────────────────
  private async pollOnce(): Promise<void> {
    if (this.isPolling) {
      logger.debug('Previous IMAP fetch still running, skipping');
      return;
    }
    this.isPolling = true;

    let emails: FetchedEmail[] = [];
    try {
      emails = await this.fetchNewEmails();
    } finally {
      // isPolling знімається ОДРАЗУ після IMAP — не чекаємо Telegram
      this.isPolling = false;
    }

    if (emails.length > 0) {
      // Dispatch запускається асинхронно, не блокуючи наступний poll
      this.dispatchEmails(emails).catch(err =>
        logger.error({ err }, 'Unexpected error in dispatchEmails'),
      );
    }
  }
}
