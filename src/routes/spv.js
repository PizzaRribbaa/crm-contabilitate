const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

router.get('/', async (req, res) => {
    try {
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
        res.json(await db.prepare(sql).all(...params));
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
    try {
        const db = getDb();
        const { client_id, acces_spv, acces_150, observatii } = req.body;
        if (!client_id) return res.status(400).json({ error: 'Campuri obligatorii: client_id' });
        const result = await db.prepare(
            `INSERT INTO spv_access (client_id, acces_spv, acces_150, observatii) VALUES (?, ?, ?, ?)`
        ).run(client_id, acces_spv ? 1 : 0, acces_150 ? 1 : 0, observatii || null);
        res.json({ id: result.lastInsertRowid, message: 'Acces creat cu succes' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
    try {
        const db = getDb();
        const { client_id, acces_spv, acces_150, observatii } = req.body;
        await db.prepare(
            `UPDATE spv_access SET client_id=?, acces_spv=?, acces_150=?, observatii=?, updated_at=NOW() WHERE id=?`
        ).run(client_id, acces_spv ? 1 : 0, acces_150 ? 1 : 0, observatii || null, req.params.id);
        res.json({ message: 'Acces actualizat' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const db = getDb();
        await db.prepare("DELETE FROM spv_access WHERE id = ?").run(req.params.id);
        res.json({ message: 'Acces sters' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
