const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const testDbPath = path.join(os.tmpdir(), 'memorix-test.db');
const db = new Database(testDbPath);

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
}

createSchema(db);

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

console.log('=== Testing memorix_store_fact ===');
const id1 = generateUUID();
db.prepare('INSERT INTO facts (id, subject, predicate, object, source) VALUES (?, ?, ?, ?, ?)')
  .run(id1, 'Alice', 'knows', 'Bob', 'test.js');
console.log('Stored fact with id:', id1);

console.log('\n=== Testing memorix_search_fts ===');
const results = db.prepare(`
  SELECT f.id, f.subject, f.predicate, f.object, f.source, f.valid_from
  FROM facts f
  JOIN facts_fts fts ON f.rowid = fts.rowid
  WHERE facts_fts MATCH ?
  AND f.valid_to IS NULL
  ORDER BY rank
  LIMIT ?
`).all('Alice', 10);
console.log('Search results:', JSON.stringify(results, null, 2));

console.log('\n=== Testing memorix_invalidate_fact ===');
const updateResult = db.prepare('UPDATE facts SET valid_to = CURRENT_TIMESTAMP WHERE id = ? AND valid_to IS NULL').run(id1);
console.log('Invalidated:', updateResult.changes > 0);

console.log('\n=== Verifying invalidation ===');
const afterInvalidate = db.prepare('SELECT * FROM facts WHERE id = ?').get(id1);
console.log('Fact after invalidation:', JSON.stringify(afterInvalidate, null, 2));

const activeResults = db.prepare(`
  SELECT f.id, f.subject, f.predicate, f.object
  FROM facts f
  JOIN facts_fts fts ON f.rowid = fts.rowid
  WHERE facts_fts MATCH 'Alice'
  AND f.valid_to IS NULL
`).all();
console.log('Active search results (should be empty):', JSON.stringify(activeResults, null, 2));

console.log('\n=== All tests passed ===');

db.close();
