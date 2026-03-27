const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// GET all SPV/150 access records
router.get('/', (req, res) => {
    const db = getDb();
    const { search } = req.query;
    let sql = `SELECT s.*, cl.denumire, cl.cui
               FROM spv_access s JOIN clients cl ON s.client_id = cl.id`;
    const params = [];

    if (search) {
        sql += " WHERE cl.denumire LIKE ? OR cl.cui LIKE ?";
        params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY cl.denumire';

    res.json(db.prepare(sql).all(...params));
});

// POST create
router.post('/', (req, res) => {
    const db = getDb();
    const { client_id, acces_spv, acces_150, observatii } = req.body;
    if (!client_id) {
        return res.status(400).json({ error: 'Campuri obligatorii: client_id' });
    }
    const result = db.prepare(
        `INSERT INTO spv_access (client_id, acces_spv, acces_150, observatii)
         VALUES (?, ?, ?, ?)`
    ).run(client_id, acces_spv ? 1 : 0, acces_150 ? 1 : 0, observatii || null);
    res.json({ id: result.lastInsertRowid, message: 'Acces creat cu succes' });
});

// PUT update
router.put('/:id', (req, res) => {
    const db = getDb();
    const { client_id, acces_spv, acces_150, observatii } = req.body;
    db.prepare(
        `UPDATE spv_access SET client_id=?, acces_spv=?, acces_150=?, observatii=?, updated_at=datetime('now') WHERE id=?`
    ).run(client_id, acces_spv ? 1 : 0, acces_150 ? 1 : 0, observatii || null, req.params.id);
    res.json({ message: 'Acces actualizat' });
});

// DELETE
router.delete('/:id', (req, res) => {
    const db = getDb();
    db.prepare("DELETE FROM spv_access WHERE id = ?").run(req.params.id);
    res.json({ message: 'Acces sters' });
});

module.exports = router;
