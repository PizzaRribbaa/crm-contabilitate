const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

router.get('/todos', async (req, res) => {
    try {
        const db = getDb();
        const rows = await db.prepare("SELECT * FROM todos ORDER BY due_date ASC, done ASC, id DESC").all();
        res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/todos', async (req, res) => {
    try {
        const db = getDb();
        const { text, due_date } = req.body;
        if (!text || !due_date) return res.status(400).json({ error: 'Text si data sunt obligatorii' });
        const result = await db.prepare("INSERT INTO todos (text, due_date) VALUES (?, ?)").run(text, due_date);
        res.json({ id: result.lastInsertRowid, text, due_date, done: 0 });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/todos/:id/toggle', async (req, res) => {
    try {
        const db = getDb();
        const todo = await db.prepare("SELECT * FROM todos WHERE id = ?").get(req.params.id);
        if (!todo) return res.status(404).json({ error: 'Not found' });
        await db.prepare("UPDATE todos SET done = ? WHERE id = ?").run(todo.done ? 0 : 1, req.params.id);
        res.json({ ...todo, done: todo.done ? 0 : 1 });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/todos/:id', async (req, res) => {
    try {
        const db = getDb();
        const { text, due_date } = req.body;
        await db.prepare("UPDATE todos SET text = ?, due_date = ? WHERE id = ?").run(text, due_date, req.params.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/todos/:id', async (req, res) => {
    try {
        const db = getDb();
        await db.prepare("DELETE FROM todos WHERE id = ?").run(req.params.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/todos-done', async (req, res) => {
    try {
        const db = getDb();
        await db.prepare("DELETE FROM todos WHERE done = 1").run();
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
