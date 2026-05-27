import express from 'express';
import session from 'express-session';
import type { AddressInfo } from 'node:net';
import * as path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { requireAuth } from './middleware/auth';
import authRouter from './routes/auth';
import storesRouter from './routes/stores';
import usersRouter from './routes/users';
import logsRouter from './routes/logs';
import testRouter from './routes/test';

export function createServer(): express.Application {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    secret: config.ADMIN_PASSWORD + '_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
  }));

  app.use('/api/auth', authRouter);
  app.use('/admin', express.static(path.join(__dirname, '../../src/web/admin')));

  app.use('/api', requireAuth);
  app.get('/api/config', (_req, res) => {
    res.json({ botName: config.TELEGRAM_BOT_NAME });
  });
  app.use('/api/stores', storesRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/logs', logsRouter);
  app.use('/api/test', testRouter);

  app.get('/', (_req, res) => res.redirect('/admin/'));

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(err, 'API error');
    res.status(500).json({ error: err.message });
  });

  return app;
}

export function startServer(app: express.Application): Promise<void> {
  let port = config.PORT;
  let host: string | undefined;

  for (const arg of process.argv.slice(2)) {
    const portMatch = arg.match(/^--port=(\d+)$/);
    if (portMatch) {
      port = parseInt(portMatch[1], 10);
    }

    const hostMatch = arg.match(/^--host=(.+)$/);
    if (hostMatch) {
      host = hostMatch[1];
    }
  }

  return new Promise((resolve, reject) => {
    const server = host ? app.listen(port, host) : app.listen(port);

    server.once('listening', () => {
      const address = server.address();
      const boundHost =
        typeof address === 'object' && address
          ? address.address
          : host ?? '0.0.0.0';
      const boundPort =
        typeof address === 'object' && address
          ? (address as AddressInfo).port
          : port;
      const addr = host ? `${host}:${boundPort}` : `${boundHost}:${boundPort}`;

      logger.info({ port: boundPort, host: boundHost }, `Admin server started -> http://${addr}/admin/`);
      resolve();
    });

    server.once('error', (err) => {
      logger.error({ err, port, host: host ?? '0.0.0.0' }, 'Failed to start admin server');
      reject(err);
    });
  });
}
