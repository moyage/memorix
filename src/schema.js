const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.MEMORIX_DB_PATH || path.join(__dirname, '..', 'memorix.db');

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object TEXT NOT NULL,
      valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
      valid_to DATETIME DEFAULT NULL,
      source TEXT
    )
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
      subject,
      predicate,
      object,
      source,
      content='facts',
      content_rowid='rowid'
    )
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
      INSERT INTO facts_fts(rowid, subject, predicate, object, source)
      VALUES (NEW.rowid, NEW.subject, NEW.predicate, NEW.object, NEW.source);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
      INSERT INTO facts_fts(facts_fts, rowid, subject, predicate, object, source)
      VALUES ('delete', OLD.rowid, OLD.subject, OLD.predicate, OLD.object, OLD.source);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
      INSERT INTO facts_fts(facts_fts, rowid, subject, predicate, object, source)
      VALUES ('delete', OLD.rowid, OLD.subject, OLD.predicate, OLD.object, OLD.source);
      INSERT INTO facts_fts(rowid, subject, predicate, object, source)
      VALUES (NEW.rowid, NEW.subject, NEW.predicate, NEW.object, NEW.source);
    END
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_valid_from ON facts(valid_from)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_valid_to ON facts(valid_to)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_predicate ON facts(predicate)`);
}

function getDatabase() {
  const db = new Database(DB_PATH);
  createSchema(db);
  return db;
}

module.exports = { getDatabase, createSchema, DB_PATH };
