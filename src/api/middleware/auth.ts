import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.isAdmin) {
    next();
    return;
  }
  if (req.path.startsWith('/api/') || req.headers['content-type']?.includes('application/json')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.redirect('/admin/login');
}
