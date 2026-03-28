const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { initDb, getDbWrapper } = require('./src/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure directories exist
['uploads', 'generated'].forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

async function start() {
    const dbWrapper = await getDbWrapper();

    // Migration: add fisier_contract_uploaded column if missing
    try {
        dbWrapper.prepare("SELECT fisier_contract_uploaded FROM contracts LIMIT 1").get();
    } catch (e) {
        dbWrapper.exec("ALTER TABLE contracts ADD COLUMN fisier_contract_uploaded TEXT");
        console.log('Migration: added fisier_contract_uploaded column');
    }

    // Migration: restructure spv_access table (remove utilizator/parola, add acces_spv/acces_150)
    try {
        dbWrapper.prepare("SELECT acces_spv FROM spv_access LIMIT 1").get();
    } catch (e) {
        dbWrapper.exec("DROP TABLE IF EXISTS spv_access");
        dbWrapper.exec(`CREATE TABLE spv_access (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL UNIQUE,
            acces_spv INTEGER NOT NULL DEFAULT 0,
            acces_150 INTEGER NOT NULL DEFAULT 0,
            observatii TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (client_id) REFERENCES clients(id)
        )`);
        console.log('Migration: restructured spv_access table');
    }

    // Migration: add due_time column to todos
    try {
        dbWrapper.prepare("SELECT due_time FROM todos LIMIT 1").get();
    } catch (e) {
        dbWrapper.exec("ALTER TABLE todos ADD COLUMN due_time TEXT");
        console.log('Migration: added due_time column to todos');
    }

    // Seed existing templates on first run
    const existing = dbWrapper.prepare("SELECT COUNT(*) as cnt FROM templates").get();
    if (existing.cnt === 0) {
        const files = [
            { tip: 'contract', name: 'Contract de contabilitate si HR final.docx' },
            { tip: 'gdpr', name: 'Anexa_GDPR.docx' }
        ];
        files.forEach(f => {
            const src = path.join(__dirname, f.name);
            const dest = path.join(__dirname, 'uploads', `template_${f.tip}.docx`);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                dbWrapper.prepare(
                    "INSERT OR IGNORE INTO templates (tip, filename, filepath) VALUES (?, ?, ?)"
                ).run(f.tip, f.name, dest);
                console.log(`Template ${f.tip} importat: ${f.name}`);
            }
        });

        // Auto-configure templates with placeholders
        try {
            require('./setup-templates');
            console.log('Template-uri configurate cu placeholder-uri automat.');
        } catch(e) {
            console.error('Eroare configurare template-uri:', e.message);
        }
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
    app.get('/api/stats', (req, res) => {
        const db = dbWrapper;
        const totalClients = db.prepare("SELECT COUNT(*) as cnt FROM clients").get().cnt;
        const totalContracts = db.prepare("SELECT COUNT(*) as cnt FROM contracts").get().cnt;
        const pregatite = db.prepare("SELECT COUNT(*) as cnt FROM contracts WHERE status = 'pregatit'").get().cnt;
        const semnate = db.prepare("SELECT COUNT(*) as cnt FROM contracts WHERE status = 'semnat'").get().cnt;
        const active = db.prepare("SELECT COUNT(*) as cnt FROM contracts WHERE status = 'activ'").get().cnt;
        const totalSpv = db.prepare("SELECT COUNT(*) as cnt FROM spv_access WHERE acces_spv = 1").get().cnt;
        const total150 = db.prepare("SELECT COUNT(*) as cnt FROM spv_access WHERE acces_150 = 1").get().cnt;
        const todosAzi = db.prepare("SELECT COUNT(*) as cnt FROM todos WHERE due_date = date('now') AND done = 0").get().cnt;
        res.json({ totalClients, totalContracts, pregatite, semnate, active, totalSpv, total150, todosAzi });
    });

    app.listen(PORT, () => {
        console.log(`CRM pornit pe http://localhost:${PORT}`);
    });
}

start().catch(err => {
    console.error('Eroare pornire server:', err);
    process.exit(1);
});
