const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'db', 'crm.sqlite');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

let db = null;
let dbReady = null;

function initDb() {
    if (dbReady) return dbReady;

    dbReady = initSqlJs().then(SQL => {
        let buffer = null;
        if (fs.existsSync(DB_PATH)) {
            buffer = fs.readFileSync(DB_PATH);
        }
        db = buffer ? new SQL.Database(buffer) : new SQL.Database();

        // Run schema
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        db.run(schema);
        saveDb();

        return db;
    });

    return dbReady;
}

function getDb() {
    if (!db) throw new Error('Database not initialized. Call initDb() first.');
    return db;
}

function saveDb() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Wrapper that mimics better-sqlite3 API
class DbWrapper {
    constructor(sqlDb) {
        this._db = sqlDb;
    }

    prepare(sql) {
        const self = this;
        return {
            get(...params) {
                const stmt = self._db.prepare(sql);
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
                const stmt = self._db.prepare(sql);
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
                self._db.run(sql, params);
                const lastId = self._db.exec("SELECT last_insert_rowid() as id")[0];
                const changes = self._db.getRowsModified();
                saveDb();
                return {
                    lastInsertRowid: lastId ? lastId.values[0][0] : 0,
                    changes
                };
            }
        };
    }

    exec(sql) {
        this._db.run(sql);
        saveDb();
    }
}

let wrapper = null;

async function getDbWrapper() {
    if (wrapper) return wrapper;
    await initDb();
    wrapper = new DbWrapper(db);
    return wrapper;
}

module.exports = { initDb, getDb: () => wrapper, getDbWrapper };
