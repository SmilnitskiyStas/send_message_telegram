import { Router } from 'express';
import { getDb } from '../../db';
import { z } from 'zod';

const router = Router();

const storeSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().optional().default(''),
});

router.get('/', (_req, res) => {
  const db = getDb();
  const stores = db.prepare('SELECT * FROM stores ORDER BY CAST(code AS INTEGER), code').all();
  res.json(stores);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get([req.params.id]);
  if (!store) return res.status(404).json({ error: 'Not found' });
  res.json(store);
});

router.post('/', (req, res) => {
  const parsed = storeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const db = getDb();
  try {
    const result = db
      .prepare('INSERT INTO stores (name, code, address) VALUES (?, ?, ?)')
      .run([parsed.data.name, parsed.data.code, parsed.data.address]);
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get([result.lastInsertRowid]);
    res.status(201).json(store);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: `Магазин з кодом "${parsed.data.code}" вже існує` });
    }
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const parsed = storeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const db = getDb();
  try {
    const result = db
      .prepare('UPDATE stores SET name = ?, code = ?, address = ? WHERE id = ?')
      .run([parsed.data.name, parsed.data.code, parsed.data.address, req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM stores WHERE id = ?').get([req.params.id]));
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: `Код "${parsed.data.code}" вже зайнятий` });
    }
    throw err;
  }
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM stores WHERE id = ?').run([req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
