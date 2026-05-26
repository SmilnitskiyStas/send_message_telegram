"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../../db");
const dispatcher_1 = require("../../services/notification/dispatcher");
const router = (0, express_1.Router)();
// POST /api/test/send  — тестова відправка сповіщення
// Body: { store_id?: number }  — якщо не вказано, береться перший магазин з активними юзерами
router.post('/send', async (req, res) => {
    try {
        const db = (0, db_1.getDb)();
        let storeCode = null;
        if (req.body.store_id) {
            const store = db.prepare('SELECT code FROM stores WHERE id = ?').get([req.body.store_id]);
            if (!store) {
                res.status(404).json({ ok: false, error: 'Магазин не знайдено' });
                return;
            }
            storeCode = store.code;
        }
        else {
            // Знайти перший магазин де є активні користувачі з telegram_chat_id
            const store = db.prepare(`
        SELECT s.code FROM stores s
        JOIN users u ON u.store_id = s.id
        WHERE u.is_active = 1 AND u.telegram_chat_id IS NOT NULL
        LIMIT 1
      `).get([]);
            storeCode = store?.code ?? null;
        }
        if (!storeCode) {
            res.status(400).json({ ok: false, error: 'Немає активних користувачів з підключеним Telegram' });
            return;
        }
        // Формуємо фейковий лист схожий на реальний від камери
        const fakeEmail = {
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
        await (0, dispatcher_1.dispatchNotification)(fakeEmail);
        res.json({ ok: true, message: `Тестове сповіщення відправлено для магазину з кодом ${storeCode}` });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err.message ?? String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=test.js.map