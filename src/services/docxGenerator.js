const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const GENERATED_DIR = path.join(__dirname, '..', '..', 'generated');

/**
 * Genereaza un DOCX completat cu datele clientului.
 * Lucreaza direct pe XML, inlocuind {placeholder} cu valorile reale.
 * Unde nu exista date, lasa spatiu gol.
 */
function generateDocx(templatePath, data, outputFilename) {
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    let xml = zip.file('word/document.xml').asText();

    // Replace all {placeholder} patterns with actual data
    // If data is missing/empty, replace with empty string (no underscores)
    const placeholders = {
        '{nr_contract_num}': data.nr_contract_num || '',
        '{nr_contract_year}': data.nr_contract_year || '',
        '{data_contract}': data.data_contract || '',
        '{denumire}': data.denumire || '',
        '{cui}': data.cui || '',
        '{adresa}': data.adresa || '',
        '{nr_reg_comert}': data.nr_reg_comert || '',
        '{reprezentant_legal}': data.reprezentant_legal || '',
        '{onorariu_lunar}': data.onorariu_lunar || '',
        '{onorariu_salariat}': data.onorariu_salariat || '',
        '{email}': data.email || '',
        '{telefon}': data.telefon || ''
    };

    for (const [placeholder, value] of Object.entries(placeholders)) {
        // Replace all occurrences
        while (xml.includes(placeholder)) {
            xml = xml.replace(placeholder, escapeXml(value.toString()));
        }
    }

    zip.file('word/document.xml', xml);

    const buf = zip.generate({
        type: 'nodebuffer',
        compression: 'DEFLATE'
    });

    const outputPath = path.join(GENERATED_DIR, outputFilename);
    fs.writeFileSync(outputPath, buf);
    return outputPath;
}

function escapeXml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function generateContract(contractTemplatePath, gdprTemplatePath, data) {
    const safeName = (data.denumire || 'client').replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, '').replace(/\s+/g, '_');
    const safeNr = (data.nr_contract_num + '-' + data.nr_contract_year) || 'draft';

    const results = {};

    if (contractTemplatePath) {
        const contractFilename = `Contract_${safeName}_${safeNr}.docx`;
        results.contractPath = generateDocx(contractTemplatePath, data, contractFilename);
        results.contractFilename = contractFilename;
    }

    if (gdprTemplatePath) {
        const gdprFilename = `Anexa_GDPR_${safeName}_${safeNr}.docx`;
        results.gdprPath = generateDocx(gdprTemplatePath, data, gdprFilename);
        results.gdprFilename = gdprFilename;
    }

    return results;
}

module.exports = { generateContract };
