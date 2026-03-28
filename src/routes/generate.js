const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const { getDb } = require('../database');
const { getNextContractNumber } = require('../services/contractNumber');
const { generateContract } = require('../services/docxGenerator');

const GENERATED_DIR = path.join(__dirname, '..', '..', 'generated');

router.post('/', async (req, res) => {
    try {
        const db = getDb();
        const { client_id, data_contract, onorariu_lunar, onorariu_salariat, new_client } = req.body;

        let clientId = client_id;

        if (new_client) {
            const { denumire, cui, nr_reg_comert, adresa, reprezentant_legal, email, telefon } = new_client;
            if (!denumire) return res.status(400).json({ error: 'Denumirea clientului este obligatorie' });
            const result = await db.prepare(
                "INSERT INTO clients (denumire, cui, nr_reg_comert, adresa, reprezentant_legal, email, telefon) VALUES (?, ?, ?, ?, ?, ?, ?)"
            ).run(denumire, cui || '', nr_reg_comert || '', adresa || '', reprezentant_legal || '', email || '', telefon || '');
            clientId = result.lastInsertRowid;
        }

        if (!clientId) return res.status(400).json({ error: 'Selectati sau introduceti un client' });

        const client = await db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
        if (!client) return res.status(404).json({ error: 'Client negasit' });

        const contractTemplate = await db.prepare("SELECT * FROM templates WHERE tip = 'contract'").get();
        const gdprTemplate = await db.prepare("SELECT * FROM templates WHERE tip = 'gdpr'").get();

        if (!contractTemplate && !gdprTemplate) {
            return res.status(400).json({ error: 'Niciun template incarcat. Incarcati mai intai template-urile.' });
        }

        const nr_contract = await getNextContractNumber(db);
        const parts = nr_contract.split('/');

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

        const result = generateContract(
            contractTemplate ? contractTemplate.filepath : null,
            gdprTemplate ? gdprTemplate.filepath : null,
            templateData
        );

        const contractResult = await db.prepare(
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

router.get('/download/:filename', (req, res) => {
    const filepath = path.join(GENERATED_DIR, req.params.filename);
    res.download(filepath, req.params.filename, (err) => {
        if (err) res.status(404).json({ error: 'Fisier negasit' });
    });
});

router.get('/download-zip/:contractId', async (req, res) => {
    try {
        const db = getDb();
        const contract = await db.prepare(
            `SELECT c.*, cl.denumire FROM contracts c JOIN clients cl ON c.client_id = cl.id WHERE c.id = ?`
        ).get(req.params.contractId);

        if (!contract) return res.status(404).json({ error: 'Contract negasit' });

        const hasContract = contract.fisier_contract && fs.existsSync(path.join(GENERATED_DIR, contract.fisier_contract));
        const hasGdpr = contract.fisier_gdpr && fs.existsSync(path.join(GENERATED_DIR, contract.fisier_gdpr));

        if (!hasContract && !hasGdpr) {
            return res.status(404).json({ error: 'Nu exista fisiere generate pentru acest contract.' });
        }

        const zip = new PizZip();
        if (hasContract) zip.file(contract.fisier_contract, fs.readFileSync(path.join(GENERATED_DIR, contract.fisier_contract)));
        if (hasGdpr) zip.file(contract.fisier_gdpr, fs.readFileSync(path.join(GENERATED_DIR, contract.fisier_gdpr)));

        const zipBuffer = zip.generate({ type: 'nodebuffer' });
        const safeName = contract.denumire.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const safeNr = contract.nr_contract.replace('/', '-');

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="Contract_Anexa_${safeName}_${safeNr}.zip"`,
            'Content-Length': zipBuffer.length
        });
        res.send(zipBuffer);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
