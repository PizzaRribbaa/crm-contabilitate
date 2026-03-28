async function getNextContractNumber(db) {
    const currentYear = new Date().getFullYear().toString();

    const row = await db.prepare("SELECT value FROM settings WHERE key = 'contract_seq_year'").get();
    const storedYear = row ? row.value : currentYear;

    let seqRow = await db.prepare("SELECT value FROM settings WHERE key = 'contract_seq_num'").get();
    let seq = seqRow ? parseInt(seqRow.value, 10) : 0;

    if (storedYear !== currentYear) {
        seq = 0;
        await db.prepare("UPDATE settings SET value = ? WHERE key = 'contract_seq_year'").run(currentYear);
    }

    seq += 1;
    await db.prepare("UPDATE settings SET value = ? WHERE key = 'contract_seq_num'").run(seq.toString());

    const padded = seq.toString().padStart(3, '0');
    return `${padded}/${currentYear}`;
}

module.exports = { getNextContractNumber };
