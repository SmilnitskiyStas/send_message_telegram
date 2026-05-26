import { Bot, InputFile, InputMediaBuilder } from 'grammy';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getDb } from '../../db';
import { ParsedEmail, User, Store } from '../../types';
import { buildNotificationText, buildRegistrationSuccessText } from './templates';

let bot: Bot;

export function getBot(): Bot {
  if (!bot) {
    if (!config.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    bot = new Bot(config.TELEGRAM_BOT_TOKEN);
    registerHandlers(bot);
  }
  return bot;
}

function registerHandlers(b: Bot): void {
  b.command('start', async (ctx) => {
    const token = ctx.match?.trim();

    if (!token) {
      await ctx.reply(
        '👋 Це бот сповіщень служби безпеки.\n\nДля реєстрації зверніться до адміністратора та отримайте персональне посилання.',
      );
      return;
    }

    const db = getDb();
    const user: User | undefined = db
      .prepare('SELECT * FROM users WHERE registration_token = ? AND is_active = 1')
      .get([token]);

    if (!user) {
      await ctx.reply('❌ Невірний або застарілий токен реєстрації. Зверніться до адміністратора.');
      return;
    }

    if (user.telegram_chat_id) {
      await ctx.reply('ℹ️ Ваш акаунт вже зареєстровано.');
      return;
    }

    db.prepare(
      `UPDATE users
       SET telegram_chat_id = ?, telegram_username = ?, registration_token = NULL, updated_at = datetime('now')
       WHERE id = ?`,
    ).run([ctx.chat.id, ctx.from?.username ?? null, user.id]);

    const store: Store | undefined = user.store_id
      ? db.prepare('SELECT * FROM stores WHERE id = ?').get([user.store_id])
      : undefined;

    const text = buildRegistrationSuccessText(
      user.first_name,
      user.last_name,
      store?.name ?? null,
      user.role,
    );

    await ctx.reply(text, { parse_mode: 'HTML' });

    logger.info(
      { userId: user.id, chatId: ctx.chat.id, username: ctx.from?.username },
      'User registered via Telegram',
    );
  });

  b.on('message', async (ctx) => {
    await ctx.reply('👋 Використовуйте посилання від адміністратора для реєстрації.');
  });

  b.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, 'Telegram bot error');
  });
}

export async function startBot(): Promise<void> {
  const b = getBot();
  // Запуск у фоні без await — bot.start() блокуючий
  b.start({
    onStart: (info) => logger.info({ username: info.username }, 'Telegram bot started'),
  }).catch((err) => logger.error(err, 'Telegram bot crashed'));
}

export async function stopBot(): Promise<void> {
  if (bot) {
    await bot.stop();
    logger.info('Telegram bot stopped');
  }
}

// ── Надсилання сповіщень ──────────────────────────────────────────────────────

// Повертає масив message_id надісланих повідомлень (для подальшого видалення)
export async function sendNotification(
  chatId: number,
  email: ParsedEmail,
  storeName: string | null,
): Promise<number[]> {
  const b = getBot();
  const text = buildNotificationText(email, storeName);

  const images = email.attachments.filter((a) => a.isImage);

  if (images.length === 0) {
    const msg = await b.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
    return [msg.message_id];
  }

  if (images.length === 1) {
    const msg = await b.api.sendPhoto(chatId, new InputFile(images[0].content, images[0].filename), {
      caption: text,
      parse_mode: 'HTML',
    });
    return [msg.message_id];
  }

  // Кілька зображень — надсилаємо як media group
  const media = images.map((img, i) =>
    InputMediaBuilder.photo(new InputFile(img.content, img.filename), {
      caption: i === 0 ? text : undefined,
      parse_mode: i === 0 ? 'HTML' : undefined,
    }),
  );

  const msgs = await b.api.sendMediaGroup(chatId, media);
  return msgs.map((m) => m.message_id);
}

export async function sendTextMessage(chatId: number, text: string): Promise<void> {
  const b = getBot();
  await b.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
}
