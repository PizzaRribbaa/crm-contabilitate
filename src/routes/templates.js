const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
        const tip = req.body.tip || 'contract';
        const ext = path.extname(file.originalname);
        cb(null, `template_${tip}${ext}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() === '.docx') {
            cb(null, true);
        } else {
            cb(new Error('Doar fisiere .docx sunt acceptate'));
        }
    }
});

router.get('/', async (req, res) => {
    try {
        const db = getDb();
        const templates = await db.prepare("SELECT * FROM templates ORDER BY tip").all();
        res.json(templates);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const db = getDb();
        const { tip } = req.body;
        if (!tip || !['contract', 'gdpr'].includes(tip)) {
            return res.status(400).json({ error: 'Tip invalid. Folositi: contract sau gdpr' });
        }
        if (!req.file) return res.status(400).json({ error: 'Fisierul lipseste' });
        await db.prepare(
            `INSERT INTO templates (tip, filename, filepath) VALUES (?, ?, ?)
             ON CONFLICT(tip) DO UPDATE SET filename=EXCLUDED.filename, filepath=EXCLUDED.filepath, uploaded_at=NOW()`
        ).run(tip, req.file.originalname, req.file.path);
        res.json({ message: `Template ${tip} incarcat cu succes`, filename: req.file.originalname });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
