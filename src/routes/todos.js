const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// Get all todos (optionally filter by date range)
router.get('/todos', (req, res) => {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM todos ORDER BY due_date ASC, due_time ASC, done ASC, id DESC").all();
    res.json(rows);
});

// Create todo
router.post('/todos', (req, res) => {
    const db = getDb();
    const { text, due_date, due_time } = req.body;
    if (!text || !due_date) return res.status(400).json({ error: 'Text si data sunt obligatorii' });
    const result = db.prepare("INSERT INTO todos (text, due_date, due_time) VALUES (?, ?, ?)").run(text, due_date, due_time || null);
    res.json({ id: result.lastInsertRowid, text, due_date, due_time: due_time || null, done: 0 });
});

// Toggle done
router.put('/todos/:id/toggle', (req, res) => {
    const db = getDb();
    const todo = db.prepare("SELECT * FROM todos WHERE id = ?").get(req.params.id);
    if (!todo) return res.status(404).json({ error: 'Not found' });
    db.prepare("UPDATE todos SET done = ? WHERE id = ?").run(todo.done ? 0 : 1, req.params.id);
    res.json({ ...todo, done: todo.done ? 0 : 1 });
});

// Update todo
router.put('/todos/:id', (req, res) => {
    const db = getDb();
    const { text, due_date, due_time } = req.body;
    db.prepare("UPDATE todos SET text = ?, due_date = ?, due_time = ? WHERE id = ?").run(text, due_date, due_time || null, req.params.id);
    res.json({ success: true });
});

// Delete todo
router.delete('/todos/:id', (req, res) => {
    const db = getDb();
    db.prepare("DELETE FROM todos WHERE id = ?").run(req.params.id);
    res.json({ success: true });
});

// Delete all done todos
router.delete('/todos-done', (req, res) => {
    const db = getDb();
    db.prepare("DELETE FROM todos WHERE done = 1").run();
    res.json({ success: true });
});

module.exports = router;
