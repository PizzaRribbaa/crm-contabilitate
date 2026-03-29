const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const session = require('express-session');
const { initDb, getDb } = require('./src/database');
const { authMiddleware, AUTH_USER, AUTH_PASS } = require('./src/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'crm-secret-local-dev-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production' && process.env.DATABASE_URL ? true : false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 ore
    },
    ...(process.env.NODE_ENV === 'production' ? { proxy: true } : {})
}));

// Login/Logout API (before auth middleware)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === AUTH_USER && password === AUTH_PASS) {
        req.session.authenticated = true;
        res.json({ message: 'OK' });
    } else {
        res.status(401).json({ error: 'Utilizator sau parola incorecta' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'OK' });
});

// Auth middleware
app.use(authMiddleware);

// Static files (after auth)
app.use(express.static(path.join(__dirname, 'public')));

// Ensure directories exist
['uploads', 'generated'].forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

async function start() {
    await initDb();
    const db = getDb();

    // Migrations for SQLite local dev only
    if (!process.env.DATABASE_URL) {
        try {
            await db.prepare("SELECT fisier_contract_uploaded FROM contracts LIMIT 1").get();
        } catch (e) {
            db.exec("ALTER TABLE contracts ADD COLUMN fisier_contract_uploaded TEXT");
            console.log('Migration: added fisier_contract_uploaded column');
        }

        try {
            await db.prepare("SELECT due_time FROM todos LIMIT 1").get();
        } catch (e) {
            db.exec("ALTER TABLE todos ADD COLUMN due_time TEXT");
            console.log('Migration: added due_time column to todos');
        }

        try {
            await db.prepare("SELECT filedata FROM templates LIMIT 1").get();
        } catch (e) {
            db.exec("ALTER TABLE templates ADD COLUMN filedata BLOB");
            console.log('Migration: added filedata column to templates');
        }

        // Migrate existing file-based templates to DB
        const templates = db.prepare("SELECT * FROM templates WHERE filedata IS NULL AND filepath IS NOT NULL").all();
        const fsMig = require('fs');
        templates.forEach(t => {
            if (fsMig.existsSync(t.filepath)) {
                const buf = fsMig.readFileSync(t.filepath);
                db.prepare("UPDATE templates SET filedata = ? WHERE id = ?").run(buf, t.id);
                console.log(`Migration: loaded ${t.tip} template into DB`);
            }
        });
    }

    // Routes
    const contractRoutes = require('./src/routes/contracts');
    const spvRoutes = require('./src/routes/spv');
    const templateRoutes = require('./src/routes/templates');
    const generateRoutes = require('./src/routes/generate');
    const todoRoutes = require('./src/routes/todos');

    app.use('/api', contractRoutes);
    app.use('/api/spv', spvRoutes);
    app.use('/api/templates', templateRoutes);
    app.use('/api/generate', generateRoutes);
    app.use('/api', todoRoutes);

    // Dashboard stats
    app.get('/api/stats', async (req, res) => {
        try {
            const totalClients = (await db.prepare("SELECT COUNT(*) as cnt FROM clients").get()).cnt;
            const totalContracts = (await db.prepare("SELECT COUNT(*) as cnt FROM contracts").get()).cnt;
            const pregatite = (await db.prepare("SELECT COUNT(*) as cnt FROM contracts WHERE status = 'pregatit'").get()).cnt;
            const semnate = (await db.prepare("SELECT COUNT(*) as cnt FROM contracts WHERE status = 'semnat'").get()).cnt;
            const active = (await db.prepare("SELECT COUNT(*) as cnt FROM contracts WHERE status = 'activ'").get()).cnt;
            const totalSpv = (await db.prepare("SELECT COUNT(*) as cnt FROM spv_access WHERE acces_spv = 1").get()).cnt;
            const total150 = (await db.prepare("SELECT COUNT(*) as cnt FROM spv_access WHERE acces_150 = 1").get()).cnt;
            const todosAzi = (await db.prepare("SELECT COUNT(*) as cnt FROM todos WHERE due_date = ? AND done = 0").get(new Date().toISOString().split('T')[0])).cnt;
            res.json({ totalClients, totalContracts, pregatite, semnate, active, totalSpv, total150, todosAzi });
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    app.listen(PORT, () => {
        console.log(`CRM pornit pe http://localhost:${PORT}`);
    });
}

start().catch(err => {
    console.error('Eroare pornire server:', err);
    process.exit(1);
});
