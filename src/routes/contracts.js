const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('../database');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_');
        cb(null, `contract_uploaded_${req.params.id}_${Date.now()}_${safeName}`);
    }
});
const uploadContract = multer({
    storage: uploadStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Doar fisiere PDF sunt acceptate'));
    },
    limits: { fileSize: 20 * 1024 * 1024 }
});
const { getNextContractNumber } = require('../services/contractNumber');

// ============ CLIENTS ============

router.get('/clients', async (req, res) => {
    try {
        const db = getDb();
        const { search } = req.query;
        let clients;
        if (search) {
            clients = await db.prepare(
                "SELECT * FROM clients WHERE denumire LIKE ? OR cui LIKE ? ORDER BY denumire"
            ).all(`%${search}%`, `%${search}%`);
        } else {
            clients = await db.prepare("SELECT * FROM clients ORDER BY denumire").all();
        }
        res.json(clients);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/clients/:id', async (req, res) => {
    try {
        const db = getDb();
        const client = await db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id);
        if (!client) return res.status(404).json({ error: 'Client negasit' });
        res.json(client);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/clients', async (req, res) => {
    try {
        const db = getDb();
        const { denumire, cui, nr_reg_comert, adresa, reprezentant_legal, email, telefon } = req.body;
        if (!denumire) return res.status(400).json({ error: 'Denumirea este obligatorie' });
        const result = await db.prepare(
            "INSERT INTO clients (denumire, cui, nr_reg_comert, adresa, reprezentant_legal, email, telefon) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(denumire, cui, nr_reg_comert || null, adresa, reprezentant_legal, email || null, telefon || null);
        res.json({ id: result.lastInsertRowid, message: 'Client creat cu succes' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/clients/:id', async (req, res) => {
    try {
        const db = getDb();
        const { denumire, cui, nr_reg_comert, adresa, reprezentant_legal, email, telefon } = req.body;
        await db.prepare(
            "UPDATE clients SET denumire=?, cui=?, nr_reg_comert=?, adresa=?, reprezentant_legal=?, email=?, telefon=? WHERE id=?"
        ).run(denumire, cui, nr_reg_comert || null, adresa, reprezentant_legal, email || null, telefon || null, req.params.id);
        res.json({ message: 'Client actualizat' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/clients/:id', async (req, res) => {
    try {
        const db = getDb();
        const contracts = await db.prepare("SELECT COUNT(*) as cnt FROM contracts WHERE client_id = ?").get(req.params.id);
        const spv = await db.prepare("SELECT COUNT(*) as cnt FROM spv_access WHERE client_id = ?").get(req.params.id);
        if (contracts.cnt > 0 || spv.cnt > 0) {
            return res.status(400).json({ error: 'Clientul are contracte sau accese asociate. Stergeti-le mai intai.' });
        }
        await db.prepare("DELETE FROM clients WHERE id = ?").run(req.params.id);
        res.json({ message: 'Client sters' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============ CONTRACTS ============

router.get('/contracts', async (req, res) => {
    try {
        const db = getDb();
        const { status, search } = req.query;
        let sql = `SELECT c.*, cl.denumire, cl.cui, cl.adresa, cl.reprezentant_legal
                   FROM contracts c JOIN clients cl ON c.client_id = cl.id`;
        const conditions = [];
        const params = [];

        if (status && status !== 'toate') {
            conditions.push("c.status = ?");
            params.push(status);
        }
        if (search) {
            conditions.push("(cl.denumire LIKE ? OR cl.cui LIKE ? OR c.nr_contract LIKE ?)");
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY c.created_at DESC';

        const contracts = await db.prepare(sql).all(...params);
        res.json(contracts);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/contracts/:id', async (req, res) => {
    try {
        const db = getDb();
        const contract = await db.prepare(
            `SELECT c.*, cl.denumire, cl.cui, cl.adresa, cl.reprezentant_legal, cl.nr_reg_comert, cl.email, cl.telefon
             FROM contracts c JOIN clients cl ON c.client_id = cl.id WHERE c.id = ?`
        ).get(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract negasit' });
        res.json(contract);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/contracts/next-number/preview', async (req, res) => {
    try {
        const db = getDb();
        const currentYear = new Date().getFullYear().toString();
        const row = await db.prepare("SELECT value FROM settings WHERE key = 'contract_seq_year'").get();
        const storedYear = row ? row.value : currentYear;
        let seqRow = await db.prepare("SELECT value FROM settings WHERE key = 'contract_seq_num'").get();
        let seq = seqRow ? parseInt(seqRow.value, 10) : 0;
        if (storedYear !== currentYear) seq = 0;
        const next = (seq + 1).toString().padStart(3, '0');
        res.json({ next_number: `${next}/${currentYear}` });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/contracts', async (req, res) => {
    try {
        const db = getDb();
        const { client_id, data_contract, status, onorariu_lunar, onorariu_salariat, observatii } = req.body;
        if (!client_id || !data_contract) {
            return res.status(400).json({ error: 'Campuri obligatorii: client_id, data_contract' });
        }
        const nr_contract = await getNextContractNumber(db);
        const result = await db.prepare(
            `INSERT INTO contracts (nr_contract, data_contract, client_id, status, onorariu_lunar, onorariu_salariat, observatii)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(nr_contract, data_contract, client_id, status || 'pregatit', onorariu_lunar || null, onorariu_salariat || 50, observatii || null);
        res.json({ id: result.lastInsertRowid, nr_contract, message: 'Contract creat cu succes' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/contracts/:id', async (req, res) => {
    try {
        const db = getDb();
        const { data_contract, status, onorariu_lunar, onorariu_salariat, observatii } = req.body;
        await db.prepare(
            `UPDATE contracts SET data_contract=?, status=?, onorariu_lunar=?, onorariu_salariat=?, observatii=?, updated_at=datetime('now') WHERE id=?`
        ).run(data_contract, status, onorariu_lunar || null, onorariu_salariat || 50, observatii || null, req.params.id);
        res.json({ message: 'Contract actualizat' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/contracts/:id/upload', (req, res) => {
    uploadContract.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Eroare la incarcare fisier' });
        if (!req.file) return res.status(400).json({ error: 'Niciun fisier selectat' });
        try {
            const db = getDb();
            const contract = await db.prepare("SELECT * FROM contracts WHERE id = ?").get(req.params.id);
            if (!contract) {
                fs.unlinkSync(req.file.path);
                return res.status(404).json({ error: 'Contract negasit' });
            }
            if (contract.fisier_contract_uploaded) {
                const oldPath = path.join(UPLOADS_DIR, contract.fisier_contract_uploaded);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            await db.prepare("UPDATE contracts SET fisier_contract_uploaded = ?, updated_at = datetime('now') WHERE id = ?")
                .run(req.file.filename, req.params.id);
            res.json({ message: 'Contract incarcat cu succes', filename: req.file.filename });
        } catch(e) { res.status(500).json({ error: e.message }); }
    });
});

router.get('/contracts/:id/download-uploaded', async (req, res) => {
    try {
        const db = getDb();
        const contract = await db.prepare("SELECT * FROM contracts WHERE id = ?").get(req.params.id);
        if (!contract || !contract.fisier_contract_uploaded) {
            return res.status(404).json({ error: 'Niciun contract incarcat' });
        }
        const filepath = path.join(UPLOADS_DIR, contract.fisier_contract_uploaded);
        if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Fisierul nu a fost gasit' });
        res.download(filepath, contract.fisier_contract_uploaded, (err) => {
            if (err) res.status(404).json({ error: 'Eroare la descarcare' });
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/contracts/:id', async (req, res) => {
    try {
        const db = getDb();
        await db.prepare("DELETE FROM contracts WHERE id = ?").run(req.params.id);
        res.json({ message: 'Contract sters' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
