"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const config_1 = require("../../config");
const router = (0, express_1.Router)();
router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === config_1.config.ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.json({ ok: true });
    }
    else {
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
exports.default = router;
//# sourceMappingURL=auth.js.map