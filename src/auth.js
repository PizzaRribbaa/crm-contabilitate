const crypto = require('crypto');

const AUTH_USER = process.env.CRM_USER || 'admin';
const AUTH_PASS = process.env.CRM_PASS || 'admin123';

function authMiddleware(req, res, next) {
    // Allow login routes
    if (req.path === '/login.html' || req.path === '/api/login' || req.path === '/api/logout') {
        return next();
    }
    // Allow static assets (css, js, fonts)
    if (req.path.match(/\.(css|js|png|jpg|ico|woff|woff2)$/)) {
        return next();
    }

    if (req.session && req.session.authenticated) {
        return next();
    }

    // API calls get 401
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Neautorizat' });
    }

    // Pages redirect to login
    res.redirect('/login.html');
}

module.exports = { authMiddleware, AUTH_USER, AUTH_PASS };
