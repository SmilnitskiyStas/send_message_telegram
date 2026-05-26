import express from 'express';
import session from 'express-session';
import * as path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { requireAuth } from './middleware/auth';
import authRouter   from './routes/auth';
import storesRouter from './routes/stores';
import usersRouter  from './routes/users';
import logsRouter   from './routes/logs';

export function createServer(): express.Application {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    secret: config.ADMIN_PASSWORD + '_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 год
  }));

  // Публічний маршрут авторизації
  app.use('/api/auth', authRouter);

  // Статика адмін-панелі (перевірка авторизації відбувається в JS)
  app.use('/admin', express.static(path.join(__dirname, '../../src/web/admin')));

  // Захищені API-маршрути
  app.use('/api', requireAuth);
  app.use('/api/stores', storesRouter);
  app.use('/api/users',  usersRouter);
  app.use('/api/logs',   logsRouter);

  // Редирект / → /admin/
  app.get('/', (_req, res) => res.redirect('/admin/'));

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(err, 'API error');
    res.status(500).json({ error: err.message });
  });

  return app;
}

export function startServer(app: express.Application): void {
  // Парсимо --port=N та --host=IP з CLI аргументів (adm.tools, cPanel передають їх автоматично)
  let port = config.PORT;
  let host: string | undefined;

  for (const arg of process.argv.slice(2)) {
    const portMatch = arg.match(/^--port=(\d+)$/);
    if (portMatch) { port = parseInt(portMatch[1], 10); }

    const hostMatch = arg.match(/^--host=(.+)$/);
    if (hostMatch) { host = hostMatch[1]; }
  }

  const onListen = () => {
    const addr = host ? `${host}:${port}` : `localhost:${port}`;
    logger.info({ port, host: host ?? '0.0.0.0' }, `Admin server started → http://${addr}/admin/`);
  };

  if (host) {
    app.listen(port, host, onListen);
  } else {
    app.listen(port, onListen);
  }
}
