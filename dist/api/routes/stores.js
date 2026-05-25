"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../../db");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const storeSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    code: zod_1.z.string().min(1),
    address: zod_1.z.string().optional().default(''),
});
router.get('/', (_req, res) => {
    const db = (0, db_1.getDb)();
    const stores = db.prepare('SELECT * FROM stores ORDER BY CAST(code AS INTEGER), code').all();
    res.json(stores);
});
router.get('/:id', (req, res) => {
    const db = (0, db_1.getDb)();
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get([req.params.id]);
    if (!store)
        return res.status(404).json({ error: 'Not found' });
    res.json(store);
});
router.post('/', (req, res) => {
    const parsed = storeSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const db = (0, db_1.getDb)();
    try {
        const result = db
            .prepare('INSERT INTO stores (name, code, address) VALUES (?, ?, ?)')
            .run([parsed.data.name, parsed.data.code, parsed.data.address]);
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get([result.lastInsertRowid]);
        res.status(201).json(store);
    }
    catch (err) {
        if (err.message?.includes('UNIQUE')) {
            return res.status(409).json({ error: `Магазин з кодом "${parsed.data.code}" вже існує` });
        }
        throw err;
    }
});
router.put('/:id', (req, res) => {
    const parsed = storeSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const db = (0, db_1.getDb)();
    try {
        const result = db
            .prepare('UPDATE stores SET name = ?, code = ?, address = ? WHERE id = ?')
            .run([parsed.data.name, parsed.data.code, parsed.data.address, req.params.id]);
        if (!result.changes)
            return res.status(404).json({ error: 'Not found' });
        res.json(db.prepare('SELECT * FROM stores WHERE id = ?').get([req.params.id]));
    }
    catch (err) {
        if (err.message?.includes('UNIQUE')) {
            return res.status(409).json({ error: `Код "${parsed.data.code}" вже зайнятий` });
        }
        throw err;
    }
});
router.delete('/:id', (req, res) => {
    const db = (0, db_1.getDb)();
    const result = db.prepare('DELETE FROM stores WHERE id = ?').run([req.params.id]);
    if (!result.changes)
        return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});
exports.default = router;
//# sourceMappingURL=stores.js.map