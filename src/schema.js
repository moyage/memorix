const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.MEMORIX_DB_PATH || path.join(__dirname, '..', 'memorix.db');

function createSchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  const tableInfo = db.prepare("PRAGMA table_info(facts)").all();
  const hasOldSchema = tableInfo.length > 0 && !tableInfo.some(col => col.name === 'context_tags');
  
  if (hasOldSchema) {
    db.exec(`DROP TRIGGER IF EXISTS facts_ai`);
    db.exec(`DROP TRIGGER IF EXISTS facts_ad`);
    db.exec(`DROP TRIGGER IF EXISTS facts_au`);
    db.exec(`DROP TABLE IF EXISTS facts`);
    db.exec(`DROP TABLE IF EXISTS facts_fts`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object TEXT NOT NULL,
      context_tags TEXT,
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
      context_tags,
      source,
      tokenize='porter',
      content='facts',
      content_rowid='rowid'
    )
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
      INSERT INTO facts_fts(rowid, subject, predicate, object, context_tags, source)
      VALUES (NEW.rowid, NEW.subject, NEW.predicate, NEW.object, NEW.context_tags, NEW.source);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
      INSERT INTO facts_fts(facts_fts, rowid, subject, predicate, object, context_tags, source)
      VALUES ('delete', OLD.rowid, OLD.subject, OLD.predicate, OLD.object, OLD.context_tags, OLD.source);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
      INSERT INTO facts_fts(facts_fts, rowid, subject, predicate, object, context_tags, source)
      VALUES ('delete', OLD.rowid, OLD.subject, OLD.predicate, OLD.object, OLD.context_tags, OLD.source);
      INSERT INTO facts_fts(rowid, subject, predicate, object, context_tags, source)
      VALUES (NEW.rowid, NEW.subject, NEW.predicate, NEW.object, NEW.context_tags, NEW.source);
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
