import { ImapFlow } from 'imapflow';
import { config } from '../../config';
import { logger } from '../../utils/logger';
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
        const processedUids: number[] = [];

        for await (const msg of client.fetch({ seen: false }, { uid: true, source: true })) {
          if (!msg.source) continue;

          try {
            const parsed = await parseRawEmail(msg.source);
            logger.info(
              { uid: msg.uid, subject: parsed.subject, from: parsed.from, attachments: parsed.attachments.length },
              'New email received',
            );
            await this.onNewMail(parsed);
            processedUids.push(msg.uid);
          } catch (err) {
            logger.error({ err, uid: msg.uid }, 'Failed to process email');
          }
        }

        if (processedUids.length > 0) {
          await client.messageFlagsAdd(processedUids, ['\\Seen'], { uid: true });
          logger.info({ count: processedUids.length }, 'Emails marked as seen');
        } else {
          logger.debug('No new emails');
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
