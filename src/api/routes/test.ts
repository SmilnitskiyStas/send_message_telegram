import { Router, Request, Response } from 'express';
import { getDb } from '../../db';
import { dispatchNotification } from '../../services/notification/dispatcher';
import { ParsedEmail } from '../../types';

const router = Router();

// POST /api/test/send  — тестова відправка сповіщення
// Body: { store_id?: number }  — якщо не вказано, береться перший магазин з активними юзерами
router.post('/send', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    let storeCode: string | null = null;

    if (req.body.store_id) {
      const store = db.prepare('SELECT code FROM stores WHERE id = ?').get([req.body.store_id]) as any;
      if (!store) {
        res.status(404).json({ ok: false, error: 'Магазин не знайдено' });
        return;
      }
      storeCode = store.code;
    } else {
      // Знайти перший магазин де є активні користувачі з telegram_chat_id
      const store = db.prepare(`
        SELECT s.code FROM stores s
        JOIN users u ON u.store_id = s.id
        WHERE u.is_active = 1 AND u.telegram_chat_id IS NOT NULL
        LIMIT 1
      `).get([]) as any;
      storeCode = store?.code ?? null;
    }

    if (!storeCode) {
      res.status(400).json({ ok: false, error: 'Немає активних користувачів з підключеним Telegram' });
      return;
    }

    // Формуємо фейковий лист схожий на реальний від камери
    const fakeEmail: ParsedEmail = {
      subject: 'Matched Face',
      from: 'v.detector@legion2015.com',
      date: new Date(),
      textBody: `Event Details:
Event Time: ${new Date().toLocaleString('uk-UA')}
Encoding Device: ${storeCode}-001 M-${storeCode} FR 01
Person Name: TEST PERSON
Similarity: 95%
Age Group: Adult
Gender: Male

⚠️ Це тестове повідомлення від адмін-панелі`,
      htmlBody: '',
      attachments: [],
    };

    await dispatchNotification(fakeEmail);

    res.json({ ok: true, message: `Тестове сповіщення відправлено для магазину з кодом ${storeCode}` });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? String(err) });
  }
});

export default router;
