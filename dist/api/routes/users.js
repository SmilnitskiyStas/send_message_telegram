"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../../db");
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const router = (0, express_1.Router)();
const userSchema = zod_1.z.object({
    last_name: zod_1.z.string().min(1),
    first_name: zod_1.z.string().min(1),
    middle_name: zod_1.z.string().optional().default(''),
    phone: zod_1.z.string().min(1),
    position: zod_1.z.string().min(1),
    store_id: zod_1.z.coerce.number().int().positive(),
    role: zod_1.z.enum(['security', 'employee']),
    receive_all: zod_1.z.coerce.number().int().min(0).max(1).default(0),
    is_active: zod_1.z.coerce.number().int().min(0).max(1).default(1),
});
function generateToken() {
    return (0, crypto_1.randomBytes)(24).toString('hex');
}
router.get('/', (req, res) => {
    const db = (0, db_1.getDb)();
    const { store_id, role } = req.query;
    let sql = `
    SELECT u.*, s.name AS store_name
    FROM users u
    LEFT JOIN stores s ON s.id = u.store_id
    WHERE 1=1
  `;
    const params = [];
    if (store_id) {
        sql += ' AND u.store_id = ?';
        params.push(store_id);
    }
    if (role) {
        sql += ' AND u.role = ?';
        params.push(role);
    }
    sql += ' ORDER BY u.last_name, u.first_name';
    const users = db.prepare(sql).all(params.length ? params : []);
    res.json(users);
});
router.get('/:id', (req, res) => {
    const db = (0, db_1.getDb)();
    const user = db.prepare(`
    SELECT u.*, s.name AS store_name
    FROM users u LEFT JOIN stores s ON s.id = u.store_id
    WHERE u.id = ?
  `).get([req.params.id]);
    if (!user)
        return res.status(404).json({ error: 'Not found' });
    res.json(user);
});
router.post('/', (req, res) => {
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const token = generateToken();
    const d = parsed.data;
    const db = (0, db_1.getDb)();
    const result = db.prepare(`
    INSERT INTO users
      (last_name, first_name, middle_name, phone, position, store_id, role, receive_all, is_active, registration_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([d.last_name, d.first_name, d.middle_name, d.phone, d.position, d.store_id, d.role, d.receive_all, d.is_active, token]);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get([result.lastInsertRowid]);
    res.status(201).json(user);
});
router.put('/:id', (req, res) => {
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const d = parsed.data;
    const db = (0, db_1.getDb)();
    const result = db.prepare(`
    UPDATE users
    SET last_name=?, first_name=?, middle_name=?, phone=?, position=?,
        store_id=?, role=?, receive_all=?, is_active=?
    WHERE id = ?
  `).run([d.last_name, d.first_name, d.middle_name, d.phone, d.position, d.store_id, d.role, d.receive_all, d.is_active, req.params.id]);
    if (!result.changes)
        return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM users WHERE id = ?').get([req.params.id]));
});
router.delete('/:id', (req, res) => {
    const db = (0, db_1.getDb)();
    const result = db.prepare('DELETE FROM users WHERE id = ?').run([req.params.id]);
    if (!result.changes)
        return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});
// Перегенерувати токен реєстрації
router.post('/:id/regenerate-token', (req, res) => {
    const db = (0, db_1.getDb)();
    const token = generateToken();
    const result = db.prepare(`
    UPDATE users SET registration_token = ?, telegram_chat_id = NULL, telegram_username = NULL WHERE id = ?
  `).run([token, req.params.id]);
    if (!result.changes)
        return res.status(404).json({ error: 'Not found' });
    res.json({ token });
});
exports.default = router;
//# sourceMappingURL=users.js.map