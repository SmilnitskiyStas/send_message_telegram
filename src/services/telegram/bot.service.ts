import { Bot, InputFile, InputMediaBuilder } from 'grammy';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getDb } from '../../db';
import { ParsedEmail, User, Store, EmailAttachment } from '../../types';
import { buildRegistrationSuccessText } from './templates';

let bot: Bot;

// ── Самостійна реєстрація через бота ─────────────────────────────────────────

interface RegState {
  step: 'last_name' | 'first_name' | 'middle_name' | 'store';
  phone: string;        // оригінальний формат від Telegram
  last_name?: string;
  first_name?: string;
  middle_name?: string;
  startedAt: number;
}

const pendingReg = new Map<number, RegState>(); // chatId → стан реєстрації

// Очистка протермінованих сесій (> 10 хвилин)
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of pendingReg) {
    if (now - s.startedAt > 10 * 60_000) pendingReg.delete(id);
  }
}, 5 * 60_000);

function chunkArr<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function getStoreButtons(): Array<Array<{ text: string; callback_data: string }>> {
  const stores = getDb()
    .prepare('SELECT id, name, code FROM stores ORDER BY CAST(code AS INTEGER)')
    .all() as (Store & { code: string })[];
  const rows = chunkArr(stores, 6).map(row =>
    row.map(s => ({ text: s.name, callback_data: `reg_store_${s.id}` })),
  );
  rows.push([{ text: '❌ Скасувати', callback_data: 'reg_cancel' }]);
  return rows;
}

// ── Ініціалізація бота ────────────────────────────────────────────────────────

export function getBot(): Bot {
  if (!bot) {
    if (!config.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set');
    bot = new Bot(config.TELEGRAM_BOT_TOKEN, {
      client: { timeoutSeconds: 30 },
    });
    registerHandlers(bot);
  }
  return bot;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function registerHandlers(b: Bot): void {

  // ─── /start ───────────────────────────────────────────────────────────────
  b.command('start', async (ctx) => {
    // Скасовуємо будь-яку незавершену реєстрацію
    pendingReg.delete(ctx.chat.id);

    const token = ctx.match?.trim();

    if (!token) {
      await ctx.reply(
        '👋 Привіт!\n\nЦей бот надсилає сповіщення служби безпеки магазинів.\n\n' +
        '📱 Щоб зареєструватися, натисніть кнопку нижче та поділіться своїм номером телефону:',
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

    // /start з токеном — реєстрація через посилання від адміна
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

    logger.info({ userId: user.id, chatId: ctx.chat.id, username: ctx.from?.username },
      'User registered via Telegram token');
  });

  // ─── /cancel — скасування реєстрації ─────────────────────────────────────
  b.command('cancel', async (ctx) => {
    if (pendingReg.delete(ctx.chat.id)) {
      await ctx.reply('❌ Реєстрацію скасовано.', { reply_markup: { remove_keyboard: true } });
    } else {
      await ctx.reply('Немає активної реєстрації.', { reply_markup: { remove_keyboard: true } });
    }
  });

  // ─── Користувач поділився номером телефону ────────────────────────────────
  b.on('message:contact', async (ctx) => {
    const contact = ctx.message.contact;
    if (!contact?.phone_number) return;

    if (contact.user_id && contact.user_id !== ctx.from?.id) {
      await ctx.reply('⚠️ Будь ласка, поділіться своїм власним номером телефону.',
        { reply_markup: { remove_keyboard: true } });
      return;
    }

    const db = getDb();
    const normalizedIncoming = normalizePhone(contact.phone_number);
    const allUsers = db.prepare('SELECT * FROM users WHERE is_active = 1').all() as User[];

    const phoneMatch = (u: User) => {
      const dbPhone = normalizePhone(u.phone);
      return dbPhone === normalizedIncoming ||
        dbPhone.endsWith(normalizedIncoming.slice(-9)) ||
        normalizedIncoming.endsWith(dbPhone.slice(-9));
    };

    const matched = allUsers.find(phoneMatch);

    if (!matched) {
      // Телефон не знайдено — починаємо самостійну реєстрацію
      pendingReg.set(ctx.chat.id, {
        step: 'last_name',
        phone: contact.phone_number,
        startedAt: Date.now(),
      });
      await ctx.reply(
        '📝 Ваш номер не знайдено в системі.\n\n' +
        'Давайте зареєструємось! Введіть ваше <b>прізвище</b>:\n\n' +
        '<i>Для скасування: /cancel</i>',
        { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } },
      );
      logger.info({ phone: normalizedIncoming, chatId: ctx.chat.id }, 'Starting self-registration');
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

    // Вже зареєстрований з іншим chat_id
    if (matched.telegram_chat_id && matched.telegram_chat_id !== ctx.chat.id) {
      await ctx.reply(
        `ℹ️ Акаунт <b>${matched.last_name} ${matched.first_name}</b> вже зареєстровано в іншому Telegram-акаунті.\n\n` +
        `Якщо потрібно переприв'язати — зверніться до адміністратора.`,
        { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } },
      );
      return;
    }

    // Знайдено, але ще не зареєстрований — надсилаємо посилання
    if (!matched.registration_token) {
      const { randomBytes } = await import('crypto');
      const newToken = randomBytes(24).toString('hex');
      db.prepare(`UPDATE users SET registration_token = ? WHERE id = ?`).run([newToken, matched.id]);
      matched.registration_token = newToken;
    }

    const link = `https://t.me/${config.TELEGRAM_BOT_NAME}?start=${matched.registration_token}`;
    await ctx.reply(
      `✅ Знайшли ваш акаунт!\n\n` +
      `👤 <b>${matched.last_name} ${matched.first_name}</b>\n\n` +
      `Для завершення реєстрації натисніть кнопку нижче:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '✅ Зареєструватися', url: link }]],
        } as any,
      },
    );
    logger.info({ userId: matched.id, phone: normalizedIncoming, chatId: ctx.chat.id },
      'Registration link sent via phone lookup');
  });

  // ─── Callback queries (вибір магазину, підтвердження тощо) ───────────────
  b.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.from.id;

    // Вибір магазину
    if (data.startsWith('reg_store_')) {
      const storeId = parseInt(data.slice('reg_store_'.length));
      const state = pendingReg.get(chatId);

      if (!state || state.step !== 'store') {
        await ctx.answerCallbackQuery('⏰ Сесія реєстрації закінчилась. Натисніть /start');
        return;
      }

      const store = getDb().prepare('SELECT * FROM stores WHERE id = ?').get([storeId]) as Store | undefined;

      await ctx.editMessageText(
        `📋 <b>Перевірте ваші дані:</b>\n\n` +
        `👤 ${state.last_name} ${state.first_name}${state.middle_name ? ' ' + state.middle_name : ''}\n` +
        `📞 ${state.phone}\n` +
        `🏪 ${store?.name ?? 'Магазин ' + storeId}\n` +
        `👷 Співробітник\n\n` +
        `Все вірно?`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Підтвердити', callback_data: `reg_confirm_${storeId}` },
              { text: '◀️ Змінити магазин', callback_data: 'reg_back_store' },
            ]],
          },
        },
      );
      await ctx.answerCallbackQuery();
      return;
    }

    // Підтвердження реєстрації
    if (data.startsWith('reg_confirm_')) {
      const storeId = parseInt(data.slice('reg_confirm_'.length));
      const state = pendingReg.get(chatId);

      if (!state) {
        await ctx.answerCallbackQuery('⏰ Сесія реєстрації закінчилась. Натисніть /start');
        return;
      }

      try {
        const db = getDb();
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get([storeId]) as Store | undefined;

        db.prepare(`
          INSERT INTO users
            (last_name, first_name, middle_name, phone, position, store_id, role,
             telegram_chat_id, telegram_username, is_active)
          VALUES (?, ?, ?, ?, 'Співробітник', ?, 'employee', ?, ?, 1)
        `).run([
          state.last_name, state.first_name, state.middle_name || '',
          state.phone, storeId, chatId, ctx.from?.username ?? null,
        ]);

        pendingReg.delete(chatId);

        await ctx.editMessageText(
          `✅ <b>Реєстрацію завершено!</b>\n\n` +
          `👤 ${state.last_name} ${state.first_name}${state.middle_name ? ' ' + state.middle_name : ''}\n` +
          `🏪 ${store?.name ?? ''}\n` +
          `👷 Співробітник\n\n` +
          `Ви будете отримувати сповіщення автоматично.`,
          { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } },
        );
        await ctx.answerCallbackQuery('✅ Зареєстровано!');

        logger.info({ chatId, phone: state.phone, store: store?.name }, 'User self-registered');
      } catch (err: any) {
        pendingReg.delete(chatId);
        logger.error({ err, chatId }, 'Self-registration DB error');
        await ctx.editMessageText('❌ Помилка реєстрації. Зверніться до адміністратора.',
          { reply_markup: { inline_keyboard: [] } });
        await ctx.answerCallbackQuery('❌ Помилка');
      }
      return;
    }

    // Пропустити по батькові
    if (data === 'reg_skip_middle') {
      const state = pendingReg.get(chatId);
      if (!state || state.step !== 'middle_name') {
        await ctx.answerCallbackQuery('⏰ Сесія реєстрації закінчилась. Натисніть /start');
        return;
      }
      state.middle_name = '';
      state.step = 'store';
      await ctx.editMessageText('🏪 Оберіть ваш <b>магазин</b>:', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: getStoreButtons() },
      });
      await ctx.answerCallbackQuery();
      return;
    }

    // Повернутись до вибору магазину
    if (data === 'reg_back_store') {
      const state = pendingReg.get(chatId);
      if (!state) {
        await ctx.answerCallbackQuery('⏰ Сесія реєстрації закінчилась. Натисніть /start');
        return;
      }
      state.step = 'store';
      await ctx.editMessageText('🏪 Оберіть ваш <b>магазин</b>:', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: getStoreButtons() },
      });
      await ctx.answerCallbackQuery();
      return;
    }

    // Скасувати реєстрацію
    if (data === 'reg_cancel') {
      pendingReg.delete(chatId);
      await ctx.editMessageText('❌ Реєстрацію скасовано.', { reply_markup: { inline_keyboard: [] } });
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // ─── Текстові повідомлення — кроки реєстрації або дефолт ─────────────────
  b.on('message', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = pendingReg.get(chatId);
    const text = 'text' in ctx.message ? (ctx.message.text ?? '').trim() : '';

    if (!state) {
      await ctx.reply('👋 Використовуйте посилання від адміністратора або натисніть /start для реєстрації.');
      return;
    }

    if (!text) {
      await ctx.reply('Будь ласка, введіть текстову відповідь.');
      return;
    }

    switch (state.step) {
      case 'last_name': {
        if (text.length < 2) { await ctx.reply('⚠️ Прізвище занадто коротке. Спробуйте ще раз:'); return; }
        state.last_name = text;
        state.step = 'first_name';
        await ctx.reply("Введіть ваше <b>ім'я</b>:", { parse_mode: 'HTML' });
        break;
      }
      case 'first_name': {
        if (text.length < 2) { await ctx.reply("⚠️ Ім'я занадто коротке. Спробуйте ще раз:"); return; }
        state.first_name = text;
        state.step = 'middle_name';
        await ctx.reply(
          'Введіть ваше <b>по батькові</b>:',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '➡️ Пропустити', callback_data: 'reg_skip_middle' }]],
            },
          },
        );
        break;
      }
      case 'middle_name': {
        state.middle_name = text;
        state.step = 'store';
        await ctx.reply('🏪 Оберіть ваш <b>магазин</b>:', {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: getStoreButtons() },
        });
        break;
      }
      case 'store': {
        await ctx.reply('🏪 Будь ласка, оберіть магазин зі списку вище (або ❌ Скасувати).');
        break;
      }
    }
  });

  b.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, 'Telegram bot error');
  });
}

export async function startBot(): Promise<void> {
  const b = getBot();
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

function isRetryableServerError(err: any): boolean {
  const code = err?.error_code ?? err?.response?.status;
  if (code === 429 || code === 502 || code === 503 || code === 504) return true;
  const msg = String(err?.message ?? '');
  return /\b(429|502|503|504)\b/.test(msg) || /ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN/.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isRetryableServerError(err)) throw err;

      if (attempt === maxAttempts) break;

      const retryAfter: number = err?.parameters?.retry_after ?? err?.retry_after ?? 0;
      const waitMs = retryAfter > 0
        ? (retryAfter + 1) * 1000
        : Math.min(1000 * 2 ** (attempt - 1), 15_000);
      logger.warn(
        { attempt, waitMs, errCode: err?.error_code, err: err?.message },
        'Telegram API error, retrying',
      );
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

// ── Надсилання сповіщень ──────────────────────────────────────────────────────

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

  const media = images.map((img, i) =>
    InputMediaBuilder.photo(new InputFile(img.content, img.filename), {
      caption: i === 0 ? text : undefined,
      parse_mode: i === 0 ? 'HTML' : undefined,
    }),
  );

  // Спочатку пробуємо як media group
  try {
    const msgs = await withRetry(() => b.api.sendMediaGroup(chatId, media));
    return msgs.map((m) => m.message_id);
  } catch (groupErr: any) {
    // IMAGE_PROCESS_FAILED або інша помилка — пробуємо кожне фото окремо
    logger.warn(
      { chatId, imageCount: images.length, err: groupErr?.message },
      'sendMediaGroup failed, falling back to individual photo sends',
    );
  }

  // Fallback: надсилаємо по одному, пропускаємо проблемні
  const messageIds: number[] = [];
  let captionSent = false;
  for (const img of images) {
    try {
      const caption = captionSent ? undefined : text;
      const msg = await b.api.sendPhoto(
        chatId,
        new InputFile(img.content, img.filename),
        { caption, parse_mode: caption ? 'HTML' : undefined },
      );
      messageIds.push(msg.message_id);
      captionSent = true;
    } catch (imgErr: any) {
      logger.warn({ chatId, filename: img.filename, err: imgErr?.message }, 'Skipping bad image');
    }
  }

  // Якщо жодне фото не пройшло — надсилаємо хоча б текст
  if (messageIds.length === 0) {
    logger.warn({ chatId }, 'All images failed, sending text-only notification');
    const msg = await withRetry(() => b.api.sendMessage(chatId, text, { parse_mode: 'HTML' }));
    return [msg.message_id];
  }

  return messageIds;
}

export async function sendTextMessage(chatId: number, text: string): Promise<void> {
  const b = getBot();
  await b.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
}
