const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb } = require('../database');
const { getNextContractNumber } = require('../services/contractNumber');
const { generateContract } = require('../services/docxGenerator');

const GENERATED_DIR = path.join(__dirname, '..', '..', 'generated');

// POST generate contract + GDPR
router.post('/', (req, res) => {
    const db = getDb();
    const { client_id, data_contract, onorariu_lunar, onorariu_salariat, new_client } = req.body;

    let clientId = client_id;

    // Create new client if provided - NO mandatory fields, save whatever is given
    if (new_client) {
        const { denumire, cui, nr_reg_comert, adresa, reprezentant_legal, email, telefon } = new_client;
        // Only denumire is truly needed to identify the client
        if (!denumire) {
            return res.status(400).json({ error: 'Denumirea clientului este obligatorie' });
        }
        const result = db.prepare(
            "INSERT INTO clients (denumire, cui, nr_reg_comert, adresa, reprezentant_legal, email, telefon) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(denumire, cui || '', nr_reg_comert || '', adresa || '', reprezentant_legal || '', email || '', telefon || '');
        clientId = result.lastInsertRowid;
    }

    if (!clientId) {
        return res.status(400).json({ error: 'Selectati sau introduceti un client' });
    }

    // Get client data
    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
    if (!client) return res.status(404).json({ error: 'Client negasit' });

    // Get templates
    const contractTemplate = db.prepare("SELECT * FROM templates WHERE tip = 'contract'").get();
    const gdprTemplate = db.prepare("SELECT * FROM templates WHERE tip = 'gdpr'").get();

    if (!contractTemplate && !gdprTemplate) {
        return res.status(400).json({ error: 'Niciun template incarcat. Incarcati mai intai template-urile.' });
    }

    // Generate contract number
    const nr_contract = getNextContractNumber(db);
    const parts = nr_contract.split('/');

    // Prepare data for template - all fields optional, empty string if missing
    const templateData = {
        nr_contract_num: parts[0] || '',
        nr_contract_year: parts[1] || '',
        nr_contract,
        data_contract: data_contract || '',
        denumire: client.denumire || '',
        cui: client.cui || '',
        nr_reg_comert: client.nr_reg_comert || '',
        adresa: client.adresa || '',
        reprezentant_legal: client.reprezentant_legal || '',
        email: client.email || '',
        telefon: client.telefon || '',
        onorariu_lunar: onorariu_lunar || '',
        onorariu_salariat: onorariu_salariat || ''
    };

    try {
        const result = generateContract(
            contractTemplate ? contractTemplate.filepath : null,
            gdprTemplate ? gdprTemplate.filepath : null,
            templateData
        );

        // Save contract in DB
        const contractResult = db.prepare(
            `INSERT INTO contracts (nr_contract, data_contract, client_id, status, onorariu_lunar, onorariu_salariat, fisier_contract, fisier_gdpr)
             VALUES (?, ?, ?, 'pregatit', ?, ?, ?, ?)`
        ).run(
            nr_contract, data_contract || '', clientId,
            onorariu_lunar || null, onorariu_salariat || null,
            result.contractFilename || null, result.gdprFilename || null
        );

        res.json({
            message: 'Contract generat cu succes',
            nr_contract,
            contract_id: contractResult.lastInsertRowid,
            files: {
                contract: result.contractFilename ? `/api/generate/download/${encodeURIComponent(result.contractFilename)}` : null,
                gdpr: result.gdprFilename ? `/api/generate/download/${encodeURIComponent(result.gdprFilename)}` : null
            }
        });
    } catch (err) {
        console.error('Eroare generare:', err);
        res.status(500).json({ error: 'Eroare la generarea documentelor: ' + err.message });
    }
});

// GET download generated file
router.get('/download/:filename', (req, res) => {
    const filepath = path.join(GENERATED_DIR, req.params.filename);
    res.download(filepath, req.params.filename, (err) => {
        if (err) res.status(404).json({ error: 'Fisier negasit' });
    });
});

module.exports = router;
