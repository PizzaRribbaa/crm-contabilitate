const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const GENERATED_DIR = path.join(__dirname, '..', '..', 'generated');

/**
 * Genereaza un DOCX completat cu datele clientului.
 * Accepta templateBuffer (Buffer din DB) sau templatePath (fisier pe disc).
 */
function generateDocx(templateSource, data, outputFilename) {
    let content;
    if (Buffer.isBuffer(templateSource)) {
        content = templateSource;
    } else {
        content = fs.readFileSync(templateSource, 'binary');
    }
    const zip = new PizZip(content);

    let xml = zip.file('word/document.xml').asText();

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

function generateContract(contractSource, gdprSource, data) {
    const safeName = (data.denumire || 'client').replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, '').replace(/\s+/g, '_');
    const safeNr = (data.nr_contract_num + '-' + data.nr_contract_year) || 'draft';

    const results = {};

    if (contractSource) {
        const contractFilename = `Contract_${safeName}_${safeNr}.docx`;
        results.contractPath = generateDocx(contractSource, data, contractFilename);
        results.contractFilename = contractFilename;
    }

    if (gdprSource) {
        const gdprFilename = `Anexa_GDPR_${safeName}_${safeNr}.docx`;
        results.gdprPath = generateDocx(gdprSource, data, gdprFilename);
        results.gdprFilename = gdprFilename;
    }

    return results;
}

module.exports = { generateContract };
