const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { getNextContractNumber } = require('../services/contractNumber');

// ============ CLIENTS ============

// GET all clients
router.get('/clients', (req, res) => {
    const db = getDb();
    const { search } = req.query;
    let clients;
    if (search) {
        clients = db.prepare(
            "SELECT * FROM clients WHERE denumire LIKE ? OR cui LIKE ? ORDER BY denumire"
        ).all(`%${search}%`, `%${search}%`);
    } else {
        clients = db.prepare("SELECT * FROM clients ORDER BY denumire").all();
    }
    res.json(clients);
});

// GET single client
router.get('/clients/:id', (req, res) => {
    const db = getDb();
    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client negasit' });
    res.json(client);
});

// POST create client
router.post('/clients', (req, res) => {
    const db = getDb();
    const { denumire, cui, nr_reg_comert, adresa, reprezentant_legal, email, telefon } = req.body;
    if (!denumire) {
        return res.status(400).json({ error: 'Denumirea este obligatorie' });
    }
    const result = db.prepare(
        "INSERT INTO clients (denumire, cui, nr_reg_comert, adresa, reprezentant_legal, email, telefon) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(denumire, cui, nr_reg_comert || null, adresa, reprezentant_legal, email || null, telefon || null);
    res.json({ id: result.lastInsertRowid, message: 'Client creat cu succes' });
});

// PUT update client
router.put('/clients/:id', (req, res) => {
    const db = getDb();
    const { denumire, cui, nr_reg_comert, adresa, reprezentant_legal, email, telefon } = req.body;
    db.prepare(
        "UPDATE clients SET denumire=?, cui=?, nr_reg_comert=?, adresa=?, reprezentant_legal=?, email=?, telefon=? WHERE id=?"
    ).run(denumire, cui, nr_reg_comert || null, adresa, reprezentant_legal, email || null, telefon || null, req.params.id);
    res.json({ message: 'Client actualizat' });
});

// DELETE client
router.delete('/clients/:id', (req, res) => {
    const db = getDb();
    const contracts = db.prepare("SELECT COUNT(*) as cnt FROM contracts WHERE client_id = ?").get(req.params.id);
    const spv = db.prepare("SELECT COUNT(*) as cnt FROM spv_access WHERE client_id = ?").get(req.params.id);
    if (contracts.cnt > 0 || spv.cnt > 0) {
        return res.status(400).json({ error: 'Clientul are contracte sau accese asociate. Stergeti-le mai intai.' });
    }
    db.prepare("DELETE FROM clients WHERE id = ?").run(req.params.id);
    res.json({ message: 'Client sters' });
});

// ============ CONTRACTS ============

// GET all contracts
router.get('/contracts', (req, res) => {
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

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY c.created_at DESC';

    const contracts = db.prepare(sql).all(...params);
    res.json(contracts);
});

// GET single contract
router.get('/contracts/:id', (req, res) => {
    const db = getDb();
    const contract = db.prepare(
        `SELECT c.*, cl.denumire, cl.cui, cl.adresa, cl.reprezentant_legal, cl.nr_reg_comert, cl.email, cl.telefon
         FROM contracts c JOIN clients cl ON c.client_id = cl.id WHERE c.id = ?`
    ).get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contract negasit' });
    res.json(contract);
});

// GET next contract number (preview)
router.get('/contracts/next-number/preview', (req, res) => {
    const db = getDb();
    const currentYear = new Date().getFullYear().toString();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'contract_seq_year'").get();
    const storedYear = row ? row.value : currentYear;
    let seqRow = db.prepare("SELECT value FROM settings WHERE key = 'contract_seq_num'").get();
    let seq = seqRow ? parseInt(seqRow.value, 10) : 0;
    if (storedYear !== currentYear) seq = 0;
    const next = (seq + 1).toString().padStart(3, '0');
    res.json({ next_number: `${next}/${currentYear}` });
});

// POST create contract
router.post('/contracts', (req, res) => {
    const db = getDb();
    const { client_id, data_contract, status, onorariu_lunar, onorariu_salariat, observatii } = req.body;
    if (!client_id || !data_contract) {
        return res.status(400).json({ error: 'Campuri obligatorii: client_id, data_contract' });
    }

    const nr_contract = getNextContractNumber(db);

    const result = db.prepare(
        `INSERT INTO contracts (nr_contract, data_contract, client_id, status, onorariu_lunar, onorariu_salariat, observatii)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(nr_contract, data_contract, client_id, status || 'pregatit', onorariu_lunar || null, onorariu_salariat || 50, observatii || null);

    res.json({ id: result.lastInsertRowid, nr_contract, message: 'Contract creat cu succes' });
});

// PUT update contract
router.put('/contracts/:id', (req, res) => {
    const db = getDb();
    const { data_contract, status, onorariu_lunar, onorariu_salariat, observatii } = req.body;
    db.prepare(
        `UPDATE contracts SET data_contract=?, status=?, onorariu_lunar=?, onorariu_salariat=?, observatii=?, updated_at=datetime('now') WHERE id=?`
    ).run(data_contract, status, onorariu_lunar || null, onorariu_salariat || 50, observatii || null, req.params.id);
    res.json({ message: 'Contract actualizat' });
});

// DELETE contract
router.delete('/contracts/:id', (req, res) => {
    const db = getDb();
    db.prepare("DELETE FROM contracts WHERE id = ?").run(req.params.id);
    res.json({ message: 'Contract sters' });
});

module.exports = router;
