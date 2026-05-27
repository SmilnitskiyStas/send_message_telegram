import { Bot, InputFile, InputMediaBuilder } from 'grammy';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getDb } from '../../db';
import { ParsedEmail, User, Store, EmailAttachment } from '../../types';
import { buildRegistrationSuccessText } from './templates';

let bot: Bot;

export function getBot(): Bot {
  if (!bot) {
    if (!config.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    bot = new Bot(config.TELEGRAM_BOT_TOKEN, {
      client: { timeoutSeconds: 30 }, // Зменшено з 500с (стандарт) до 30с
    });
    registerHandlers(bot);
  }
  return bot;
}

// Нормалізація телефону — тільки цифри
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function registerHandlers(b: Bot): void {

  // ─── /start без токена — просимо поділитися номером ───────────────────────
  b.command('start', async (ctx) => {
    const token = ctx.match?.trim();

    if (!token) {
      await ctx.reply(
        '👋 Привіт!\n\nЦей бот надсилає сповіщення служби безпеки магазинів.\n\n' +
        '📱 Щоб отримати посилання для реєстрації, натисніть кнопку нижче та поділіться своїм номером телефону:',
        {
          reply_markup: {
            keyboard: [[{ text: '📱 Поділитися номером телефону', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        },
      );
      return;
    }

    // ─── /start з токеном — стандартна реєстрація ─────────────────────────
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

    await ctx.reply(
      buildRegistrationSuccessText(user.first_name, user.last_name, store?.name ?? null, user.role),
      { parse_mode: 'HTML' },
    );

    logger.info(
      { userId: user.id, chatId: ctx.chat.id, username: ctx.from?.username },
      'User registered via Telegram',
    );
  });

  // ─── Користувач поділився номером телефону ────────────────────────────────
  b.on('message:contact', async (ctx) => {
    const contact = ctx.message.contact;
    if (!contact?.phone_number) return;

    // Перевіряємо що користувач поділився СВОЇМ номером (не чужим)
    if (contact.user_id && contact.user_id !== ctx.from?.id) {
      await ctx.reply(
        '⚠️ Будь ласка, поділіться своїм власним номером телефону.',
        { reply_markup: { remove_keyboard: true } },
      );
      return;
    }

    const db = getDb();
    const normalizedIncoming = normalizePhone(contact.phone_number);

    // Шукаємо користувача за номером телефону (серед ВСІХ активних, незалежно від chat_id)
    const allUsers = db.prepare('SELECT * FROM users WHERE is_active = 1').all() as User[];

    const phoneMatch = (u: User) => {
      const dbPhone = normalizePhone(u.phone);
      return dbPhone === normalizedIncoming ||
        dbPhone.endsWith(normalizedIncoming.slice(-9)) ||
        normalizedIncoming.endsWith(dbPhone.slice(-9));
    };

    const matched = allUsers.find(phoneMatch);

    if (!matched) {
      await ctx.reply(
        '❌ Ваш номер телефону не знайдено в системі.\n\nЗверніться до адміністратора.',
        { reply_markup: { remove_keyboard: true } },
      );
      logger.info(
        { phone: normalizedIncoming, chatId: ctx.chat.id },
        'Phone not found in users for registration',
      );
      return;
    }

    // Вже зареєстрований з іншим chat_id
    if (matched.telegram_chat_id && matched.telegram_chat_id !== ctx.chat.id) {
      await ctx.reply(
        `ℹ️ Акаунт <b>${matched.last_name} ${matched.first_name}</b> вже зареєстровано в іншому Telegram-акаунті.\n\n` +
        `Якщо потрібно переприв'язати — зверніться до адміністратора.`,
        { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } },
      );
      return;
    }

    // Вже зареєстрований в ЦЬОМУ чаті
    if (matched.telegram_chat_id === ctx.chat.id) {
      await ctx.reply(
        `✅ <b>${matched.last_name} ${matched.first_name}</b>, ваш акаунт вже зареєстровано!\n\nВи будете отримувати сповіщення автоматично.`,
        { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } },
      );
      return;
    }

    // Не зареєстрований — генеруємо токен якщо потрібно і надсилаємо посилання
    if (!matched.registration_token) {
      const { randomBytes } = await import('crypto');
      const newToken = randomBytes(24).toString('hex');
      db.prepare(`UPDATE users SET registration_token = ? WHERE id = ?`).run([newToken, matched.id]);
      matched.registration_token = newToken;
    }

    const botName = config.TELEGRAM_BOT_NAME;
    const link = `https://t.me/${botName}?start=${matched.registration_token}`;

    await ctx.reply(
      `✅ Знайшли ваш акаунт!\n\n` +
      `👤 <b>${matched.last_name} ${matched.first_name}</b>\n\n` +
      `Для завершення реєстрації натисніть кнопку нижче:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '✅ Зареєструватися', url: link }]],
          remove_keyboard: true,
        } as any,
      },
    );

    logger.info(
      { userId: matched.id, phone: normalizedIncoming, chatId: ctx.chat.id },
      'Registration link sent via phone lookup',
    );
  });

  // ─── Будь-яке інше повідомлення ───────────────────────────────────────────
  b.on('message', async (ctx) => {
    await ctx.reply(
      '👋 Використовуйте посилання від адміністратора або натисніть /start для реєстрації.',
    );
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

// ── Утиліти ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry з затримкою при 429 Too Many Requests
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const retryAfter: number = err?.parameters?.retry_after ?? err?.retry_after ?? 10;
      if (err?.error_code === 429 || String(err?.message).includes('429')) {
        const waitMs = (retryAfter + 1) * 1000;
        logger.warn({ attempt, waitMs, retryAfter }, 'Telegram rate limit (429), waiting before retry');
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

// ── Надсилання сповіщень ──────────────────────────────────────────────────────

// Повертає масив message_id надісланих повідомлень (для подальшого видалення)
export async function sendNotification(
  chatId: number,
  text: string,
  images: EmailAttachment[],
): Promise<number[]> {
  const b = getBot();

  if (images.length === 0) {
    const msg = await withRetry(() => b.api.sendMessage(chatId, text, { parse_mode: 'HTML' }));
    return [msg.message_id];
  }

  if (images.length === 1) {
    const msg = await withRetry(() =>
      b.api.sendPhoto(chatId, new InputFile(images[0].content, images[0].filename), {
        caption: text,
        parse_mode: 'HTML',
      }),
    );
    return [msg.message_id];
  }

  // Кілька зображень — надсилаємо як media group
  const media = images.map((img, i) =>
    InputMediaBuilder.photo(new InputFile(img.content, img.filename), {
      caption: i === 0 ? text : undefined,
      parse_mode: i === 0 ? 'HTML' : undefined,
    }),
  );

  const msgs = await withRetry(() => b.api.sendMediaGroup(chatId, media));
  return msgs.map((m) => m.message_id);
}

export async function sendTextMessage(chatId: number, text: string): Promise<void> {
  const b = getBot();
  await b.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
}
