const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// GET all SPV/150 access records
router.get('/', (req, res) => {
    const db = getDb();
    const { tip, search } = req.query;
    let sql = `SELECT s.*, cl.denumire, cl.cui
               FROM spv_access s JOIN clients cl ON s.client_id = cl.id`;
    const conditions = [];
    const params = [];

    if (tip && tip !== 'toate') {
        conditions.push("s.tip_acces = ?");
        params.push(tip);
    }
    if (search) {
        conditions.push("(cl.denumire LIKE ? OR cl.cui LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY cl.denumire';

    res.json(db.prepare(sql).all(...params));
});

// POST create
router.post('/', (req, res) => {
    const db = getDb();
    const { client_id, tip_acces, utilizator, parola, status, data_acces, observatii } = req.body;
    if (!client_id || !tip_acces) {
        return res.status(400).json({ error: 'Campuri obligatorii: client_id, tip_acces' });
    }
    const result = db.prepare(
        `INSERT INTO spv_access (client_id, tip_acces, utilizator, parola, status, data_acces, observatii)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(client_id, tip_acces, utilizator || null, parola || null, status || 'activ', data_acces || null, observatii || null);
    res.json({ id: result.lastInsertRowid, message: 'Acces creat cu succes' });
});

// PUT update
router.put('/:id', (req, res) => {
    const db = getDb();
    const { client_id, tip_acces, utilizator, parola, status, data_acces, observatii } = req.body;
    db.prepare(
        `UPDATE spv_access SET client_id=?, tip_acces=?, utilizator=?, parola=?, status=?, data_acces=?, observatii=?, updated_at=datetime('now') WHERE id=?`
    ).run(client_id, tip_acces, utilizator || null, parola || null, status || 'activ', data_acces || null, observatii || null, req.params.id);
    res.json({ message: 'Acces actualizat' });
});

// DELETE
router.delete('/:id', (req, res) => {
    const db = getDb();
    db.prepare("DELETE FROM spv_access WHERE id = ?").run(req.params.id);
    res.json({ message: 'Acces sters' });
});

module.exports = router;
