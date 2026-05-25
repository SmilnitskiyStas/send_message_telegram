"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
function requireAuth(req, res, next) {
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
//# sourceMappingURL=auth.js.map