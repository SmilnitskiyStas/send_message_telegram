"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../../db");
const router = (0, express_1.Router)();
router.get('/', (req, res) => {
    const db = (0, db_1.getDb)();
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')));
    const offset = (page - 1) * limit;
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM notification_log').get([]);
    const rows = db.prepare(`
    SELECT l.*, s.name AS store_name
    FROM notification_log l
    LEFT JOIN stores s ON s.id = l.store_id
    ORDER BY l.created_at DESC LIMIT ? OFFSET ?
  `).all([limit, offset]);
    res.json({ total: total.cnt, page, limit, rows });
});
// Деталі відправок конкретного запису
router.get('/:id/sends', (req, res) => {
    const db = (0, db_1.getDb)();
    const log = db.prepare('SELECT * FROM notification_log WHERE id = ?').get([req.params.id]);
    if (!log)
        return res.status(404).json({ error: 'Not found' });
    const sends = db.prepare('SELECT * FROM message_sends WHERE log_id = ? ORDER BY sent_at ASC').all([req.params.id]);
    res.json({ log, sends });
});
// Видалити один запис лога
router.delete('/:id', (req, res) => {
    const db = (0, db_1.getDb)();
    db.prepare('DELETE FROM message_sends WHERE log_id = ?').run([req.params.id]);
    const r = db.prepare('DELETE FROM notification_log WHERE id = ?').run([req.params.id]);
    if (!r.changes)
        return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});
// Видалити всі логи старіші за N днів (або всі якщо days=0)
router.delete('/', (req, res) => {
    const db = (0, db_1.getDb)();
    const days = parseInt(req.query.days || '0');
    let deleted = 0;
    if (days > 0) {
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();
        const ids = db.prepare(`SELECT id FROM notification_log WHERE created_at < ?`).all([cutoff]);
        for (const row of ids) {
            db.prepare('DELETE FROM message_sends WHERE log_id = ?').run([row.id]);
        }
        const r = db.prepare(`DELETE FROM notification_log WHERE created_at < ?`).run([cutoff]);
        deleted = r.changes;
    }
    else {
        db.prepare('DELETE FROM message_sends').run([]);
        const r = db.prepare('DELETE FROM notification_log').run([]);
        deleted = r.changes;
    }
    const remaining = db.prepare('SELECT COUNT(*) AS cnt FROM notification_log').get([]);
    res.json({ ok: true, deleted, remaining: remaining.cnt });
});
exports.default = router;
//# sourceMappingURL=logs.js.map