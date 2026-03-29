-- Clienti
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    denumire TEXT NOT NULL,
    cui TEXT NOT NULL,
    nr_reg_comert TEXT,
    adresa TEXT NOT NULL,
    reprezentant_legal TEXT NOT NULL,
    email TEXT,
    telefon TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Contracte (Modul 1)
CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nr_contract TEXT NOT NULL UNIQUE,
    data_contract TEXT NOT NULL,
    client_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pregatit',
    onorariu_lunar REAL,
    onorariu_salariat REAL DEFAULT 50,
    observatii TEXT,
    fisier_contract TEXT,
    fisier_gdpr TEXT,
    fisier_contract_uploaded TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Acces SPV + 150 (Modul 2)
CREATE TABLE IF NOT EXISTS spv_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL UNIQUE,
    acces_spv INTEGER NOT NULL DEFAULT 0,
    acces_150 INTEGER NOT NULL DEFAULT 0,
    observatii TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Template-uri document
CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tip TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    filepath TEXT,
    filedata BLOB,
    uploaded_at TEXT DEFAULT (datetime('now'))
);

-- Setari (numar contract automat)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('contract_seq_year', '2026');
INSERT OR IGNORE INTO settings (key, value) VALUES ('contract_seq_num', '0');

-- TO DO
CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    due_date TEXT NOT NULL,
    due_time TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
