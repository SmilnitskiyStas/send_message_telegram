import { Router } from 'express';
import { config } from '../../config';

const router = Router();

router.post('/login', (req, res) => {
  const { password } = req.body as { password?: string };
  if (password === config.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Невірний пароль' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

export default router;
