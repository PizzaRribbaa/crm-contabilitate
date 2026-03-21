/**
 * Converteste template-urile DOCX: inlocuieste underscore-uri cu {placeholder}
 * Lucreaza direct pe XML-ul din DOCX, tinand cont de split-uri intre <w:t> elemente
 */
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

function extractTextSegments(xml) {
    // Extract all <w:t>...</w:t> with their positions
    const segments = [];
    const regex = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
        segments.push({
            fullMatch: match[0],
            attrs: match[1],
            text: match[2],
            index: match.index,
            end: match.index + match[0].length
        });
    }
    return segments;
}

function replaceInXml(xml, segments, startIdx, endIdx, newText) {
    // Replace from segment startIdx to endIdx with newText in the first segment, remove others
    const first = segments[startIdx];
    const last = segments[endIdx];

    // Build the replacement: keep the first <w:t> tag but with new text
    // We need to preserve xml:space="preserve" attribute
    const newTag = `<w:t xml:space="preserve">${newText}</w:t>`;

    // We need to remove the <w:t> tags from startIdx+1 to endIdx
    // But they might be in different <w:r> runs, so we just replace their text with empty
    let result = xml;

    // Work backwards to preserve indices
    for (let i = endIdx; i >= startIdx; i--) {
        const seg = segments[i];
        if (i === startIdx) {
            result = result.substring(0, seg.index) + newTag + result.substring(seg.end);
        } else {
            // Empty out subsequent segments
            result = result.substring(0, seg.index) +
                `<w:t xml:space="preserve"></w:t>` +
                result.substring(seg.end);
        }
    }

    return result;
}

function processDocx(filePath, rules) {
    console.log(`\nProcesare: ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, 'binary');
    const zip = new PizZip(content);
    let xml = zip.file('word/document.xml').asText();

    // Apply rules - each rule matches a context pattern and replaces underscores
    for (const rule of rules) {
        const segments = extractTextSegments(xml);
        const texts = segments.map(s => s.text);
        const joined = texts.join('|');

        let applied = false;

        // Search for the pattern in consecutive segments
        for (let i = 0; i < segments.length; i++) {
            if (applied && rule.once) continue;

            const match = rule.match(texts, i);
            if (match) {
                console.log(`  Inlocuit: ${match.context} -> ${match.replacement}`);

                // Replace the underscore segment(s)
                const seg = segments[match.segIndex];
                const newTag = `<w:t xml:space="preserve">${match.replacement}</w:t>`;
                xml = xml.substring(0, seg.index) + newTag + xml.substring(seg.end);

                applied = true;

                // Re-extract segments since indices changed
                if (!rule.once) break; // re-loop to re-parse
            }
        }
    }

    // Save
    zip.file('word/document.xml', xml);
    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(filePath, buf);
    console.log(`  Salvat cu succes!`);
}

// Helper to check if a segment is mostly underscores
function isUnderscores(text) {
    return text && text.trim().length > 0 && /^_+$/.test(text.trim());
}

// ============================================================
// Instead of complex rule matching, use a simpler direct approach:
// Find underscore blocks by their surrounding text context
// ============================================================

function processWithContext(filePath, contextReplacements) {
    console.log(`\nProcesare: ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, 'binary');
    const zip = new PizZip(content);
    let xml = zip.file('word/document.xml').asText();

    for (const cr of contextReplacements) {
        const segments = extractTextSegments(xml);
        const texts = segments.map(s => s.text);

        for (let i = 0; i < segments.length; i++) {
            if (!isUnderscores(texts[i])) continue;

            // Check context: what's before and after
            const before = texts.slice(Math.max(0, i - 3), i).join('');
            const after = texts.slice(i + 1, Math.min(texts.length, i + 4)).join('');

            if (cr.contextMatch(before, after, texts[i])) {
                console.log(`  [${i}] "${before.slice(-30)}[${texts[i]}]${after.slice(0, 30)}" -> ${cr.placeholder}`);
                const seg = segments[i];
                const newTag = `<w:t xml:space="preserve">${cr.placeholder}</w:t>`;
                xml = xml.substring(0, seg.index) + newTag + xml.substring(seg.end);
                if (cr.once) break;
                // Need to re-process since XML changed
                break;
            }
        }
    }

    zip.file('word/document.xml', xml);
    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(filePath, buf);
    console.log(`  Salvat!`);
}

// ============================================================
// Even simpler: iterate multiple passes, each pass handles one replacement
// ============================================================

function replaceUnderscoreByIndex(filePath, targetIndices) {
    console.log(`\nProcesare: ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, 'binary');
    const zip = new PizZip(content);
    let xml = zip.file('word/document.xml').asText();

    // Sort by index descending to preserve positions
    const sorted = [...targetIndices].sort((a, b) => b.segIdx - a.segIdx);

    const segments = extractTextSegments(xml);

    // Show what we found
    console.log(`  Total segmente text: ${segments.length}`);

    for (const target of sorted) {
        const seg = segments[target.segIdx];
        if (!seg) {
            console.log(`  SKIP: segment ${target.segIdx} nu exista`);
            continue;
        }
        console.log(`  [${target.segIdx}] "${seg.text}" -> "${target.placeholder}"`);
        const newTag = `<w:t xml:space="preserve">${target.placeholder}</w:t>`;
        xml = xml.substring(0, seg.index) + newTag + xml.substring(seg.end);
    }

    zip.file('word/document.xml', xml);
    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(filePath, buf);
    console.log(`  Salvat!`);
}

// ============================================================
// Contract template - based on extracted segment indices
// ============================================================

// From analysis:
// 5: [____]  6: [/]  7: [__________]   -> Nr. contract
// 12: [__________] 13: [S.R.L]          -> Denumire (after "Incheiat")
// 20: [__________]                       -> Data contract
// 22: [__________] (before S.R.L context)-> Denumire
// 27: [_________________]                -> Adresa
// 30: [__________]                       -> Nr reg comert
// 34: [________]                         -> CUI
// 39: [___________]                      -> Reprezentant legal
// 194: [_________]                       -> Onorariu lunar
// 330: [_________]                       -> Denumire (notificari)
// 333: [_________]                       -> Reprezentant (In atentia)
// 338: [______________]                  -> Adresa (notificari)
// 344: [________________]                -> Email
// 371: [__________]                      -> Denumire (semnatura)
// 373: [__________________________]      -> Semnatura line (leave or denumire)
// 375: [____________]                    -> Reprezentant (semnatura)
// 384: [__________________]              -> Semnatura prestator (leave)
// 385: [_____]                           -> Semnatura prestator (leave)

const contractPath = path.join(__dirname, 'uploads', 'template_contract.docx');
if (fs.existsSync(contractPath)) {
    // First, restore from original
    const origPath = path.join(__dirname, 'Contract de contabilitate si HR final.docx');
    if (fs.existsSync(origPath)) {
        fs.copyFileSync(origPath, contractPath);
    }

    replaceUnderscoreByIndex(contractPath, [
        { segIdx: 5, placeholder: '{nr_contract_num}' },
        { segIdx: 7, placeholder: '{nr_contract_year}' },
        { segIdx: 12, placeholder: '{denumire}' },
        { segIdx: 20, placeholder: '{data_contract}' },
        { segIdx: 22, placeholder: '{denumire}' },
        { segIdx: 27, placeholder: '{adresa}' },
        { segIdx: 30, placeholder: '{nr_reg_comert}' },
        { segIdx: 34, placeholder: '{cui}' },
        { segIdx: 39, placeholder: '{reprezentant_legal}' },
        { segIdx: 194, placeholder: '{onorariu_lunar}' },
        { segIdx: 330, placeholder: '{denumire}' },
        { segIdx: 333, placeholder: '{reprezentant_legal}' },
        { segIdx: 338, placeholder: '{adresa}' },
        { segIdx: 344, placeholder: '{email}' },
        { segIdx: 371, placeholder: '{denumire}' },
        { segIdx: 373, placeholder: '' },
        { segIdx: 375, placeholder: '{reprezentant_legal}' },
    ]);
}

// ============================================================
// GDPR template
// ============================================================

// From analysis:
// 3: [_____]  4: [/]  5: [____________]  -> Nr. contract
// 9: [___________] 10: [ S.R.L.,]        -> Denumire
// 12: [______________]                    -> Adresa
// 14: [__________]                        -> Nr reg comert
// 16: [___________]                       -> CUI
// 24: [______________]                    -> Reprezentant legal
// 29: [_____]  30: [/]  31: [_________]   -> Nr. contract (ref)
// 46: [______]  47: [/]  48: [___________]-> Nr. contract (ref 2)
// 204: [______________]                    -> Denumire (semnatura)
// 206: [____________]                      -> Reprezentant (semnatura)
// 207: [__________________]               -> Semnatura line
// 216: [____________________]             -> Semnatura prestator (leave)

const gdprPath = path.join(__dirname, 'uploads', 'template_gdpr.docx');
if (fs.existsSync(gdprPath)) {
    // Restore from original
    const origPath = path.join(__dirname, 'Anexa_GDPR.docx');
    if (fs.existsSync(origPath)) {
        fs.copyFileSync(origPath, gdprPath);
    }

    replaceUnderscoreByIndex(gdprPath, [
        { segIdx: 3, placeholder: '{nr_contract_num}' },
        { segIdx: 5, placeholder: '{nr_contract_year}' },
        { segIdx: 9, placeholder: '{denumire}' },
        { segIdx: 12, placeholder: '{adresa}' },
        { segIdx: 14, placeholder: '{nr_reg_comert}' },
        { segIdx: 16, placeholder: '{cui}' },
        { segIdx: 24, placeholder: '{reprezentant_legal}' },
        { segIdx: 29, placeholder: '{nr_contract_num}' },
        { segIdx: 31, placeholder: '{nr_contract_year}' },
        { segIdx: 46, placeholder: '{nr_contract_num}' },
        { segIdx: 48, placeholder: '{nr_contract_year}' },
        { segIdx: 204, placeholder: '{denumire}' },
        { segIdx: 206, placeholder: '{reprezentant_legal}' },
        { segIdx: 207, placeholder: '' },
    ]);
}

console.log('\n✓ Template-urile au fost configurate cu placeholder-uri!');
console.log('Placeholder-uri disponibile: {denumire}, {cui}, {adresa}, {nr_reg_comert},');
console.log('  {reprezentant_legal}, {nr_contract_num}, {nr_contract_year}, {data_contract},');
console.log('  {onorariu_lunar}, {email}');
