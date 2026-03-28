const { Pool } = require('pg');

const isProduction = process.env.DATABASE_URL;

let pool;
let useSqlite = false;
let sqliteWrapper = null;

async function initDb() {
    if (isProduction) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        // Create tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                denumire TEXT NOT NULL,
                cui TEXT NOT NULL DEFAULT '',
                nr_reg_comert TEXT,
                adresa TEXT NOT NULL DEFAULT '',
                reprezentant_legal TEXT NOT NULL DEFAULT '',
                email TEXT,
                telefon TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS contracts (
                id SERIAL PRIMARY KEY,
                nr_contract TEXT NOT NULL UNIQUE,
                data_contract TEXT NOT NULL,
                client_id INTEGER NOT NULL REFERENCES clients(id),
                status TEXT NOT NULL DEFAULT 'pregatit',
                onorariu_lunar REAL,
                onorariu_salariat REAL DEFAULT 50,
                observatii TEXT,
                fisier_contract TEXT,
                fisier_gdpr TEXT,
                fisier_contract_uploaded TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS spv_access (
                id SERIAL PRIMARY KEY,
                client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id),
                acces_spv INTEGER NOT NULL DEFAULT 0,
                acces_150 INTEGER NOT NULL DEFAULT 0,
                observatii TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS templates (
                id SERIAL PRIMARY KEY,
                tip TEXT NOT NULL UNIQUE,
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL,
                uploaded_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS todos (
                id SERIAL PRIMARY KEY,
                text TEXT NOT NULL,
                due_date TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
            INSERT INTO settings (key, value) VALUES ('contract_seq_year', '2026') ON CONFLICT (key) DO NOTHING;
            INSERT INTO settings (key, value) VALUES ('contract_seq_num', '0') ON CONFLICT (key) DO NOTHING;
        `);
        return;
    }

    // Fallback to SQLite for local dev
    useSqlite = true;
    const initSqlJs = require('sql.js');
    const path = require('path');
    const fs = require('fs');
    const DB_PATH = path.join(__dirname, '..', 'db', 'crm.sqlite');
    const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

    const SQL = await initSqlJs();
    let buffer = null;
    if (fs.existsSync(DB_PATH)) {
        buffer = fs.readFileSync(DB_PATH);
    }
    const db = buffer ? new SQL.Database(buffer) : new SQL.Database();
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.run(schema);

    function saveDb() {
        const data = db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
    }
    saveDb();

    sqliteWrapper = {
        prepare(sql) {
            const self = this;
            return {
                get(...params) {
                    const stmt = db.prepare(sql);
                    stmt.bind(params);
                    let result = null;
                    if (stmt.step()) {
                        const cols = stmt.getColumnNames();
                        const vals = stmt.get();
                        result = {};
                        cols.forEach((col, i) => result[col] = vals[i]);
                    }
                    stmt.free();
                    return result;
                },
                all(...params) {
                    const results = [];
                    const stmt = db.prepare(sql);
                    stmt.bind(params);
                    while (stmt.step()) {
                        const cols = stmt.getColumnNames();
                        const vals = stmt.get();
                        const row = {};
                        cols.forEach((col, i) => row[col] = vals[i]);
                        results.push(row);
                    }
                    stmt.free();
                    return results;
                },
                run(...params) {
                    db.run(sql, params);
                    const lastId = db.exec("SELECT last_insert_rowid() as id")[0];
                    const changes = db.getRowsModified();
                    saveDb();
                    return {
                        lastInsertRowid: lastId ? lastId.values[0][0] : 0,
                        changes
                    };
                }
            };
        },
        exec(sql) {
            db.run(sql);
            saveDb();
        }
    };
}

// Unified DB interface that works with both PostgreSQL and SQLite
function getDb() {
    if (useSqlite) return sqliteWrapper;

    return {
        prepare(sql) {
            // Convert ? placeholders to $1, $2, etc for PostgreSQL
            let idx = 0;
            const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
            // Convert SQLite functions to PostgreSQL
            const finalSql = pgSql
                .replace(/datetime\('now'\)/g, 'NOW()')
                .replace(/ON CONFLICT\(tip\) DO UPDATE SET/g, 'ON CONFLICT(tip) DO UPDATE SET');

            return {
                async get(...params) {
                    const result = await pool.query(finalSql, params);
                    return result.rows[0] || null;
                },
                async all(...params) {
                    const result = await pool.query(finalSql, params);
                    return result.rows;
                },
                async run(...params) {
                    const returningSql = finalSql.trimEnd().replace(/;$/, '');
                    let result;
                    if (returningSql.toUpperCase().startsWith('INSERT')) {
                        result = await pool.query(returningSql + ' RETURNING id', params);
                    } else {
                        result = await pool.query(finalSql, params);
                    }
                    return {
                        lastInsertRowid: result.rows[0] ? result.rows[0].id : 0,
                        changes: result.rowCount
                    };
                }
            };
        },
        async exec(sql) {
            await pool.query(sql);
        }
    };
}

module.exports = { initDb, getDb };
