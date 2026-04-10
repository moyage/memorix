import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.MEMORIX_DB_PATH || path.join(__dirname, '..', 'memorix.db');

/**
 * Migrations definition
 * Each migration has a version number and an up function that applies the schema changes
 * Migrations are applied sequentially based on PRAGMA user_version
 */
const MIGRATIONS = [
  // Version 1: Initial schema with context_tags
  {
    version: 1,
    up: (db) => {
      // Check if facts table already exists (old schema without context_tags)
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facts'").get();
      
      if (tableExists) {
        // Table exists - need to migrate by adding context_tags column
        console.log('[Schema] Migrating existing facts table to add context_tags column');
        
        // Check if context_tags column already exists
        const tableInfo = db.prepare("PRAGMA table_info(facts)").all();
        const hasContextTags = tableInfo.some(col => col.name === 'context_tags');
        
        if (!hasContextTags) {
          // Add context_tags column to existing table (non-destructive)
          db.exec(`ALTER TABLE facts ADD COLUMN context_tags TEXT`);
          console.log('[Schema] Added context_tags column successfully');
        }
        
        // Drop and recreate FTS table to include context_tags (content is rebuilt from facts)
        db.exec(`DROP TABLE IF EXISTS facts_fts`);
      } else {
        // Fresh database - create the main facts table with full schema
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
      }

      // Create FTS5 virtual table for full-text search (works for both fresh and migrated)
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

      // Create trigger for inserting into FTS index after insert on facts
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
          INSERT INTO facts_fts(rowid, subject, predicate, object, context_tags, source)
          VALUES (NEW.rowid, NEW.subject, NEW.predicate, NEW.object, NEW.context_tags, NEW.source);
        END
      `);

      // Create trigger for deleting from FTS index after delete on facts
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
          INSERT INTO facts_fts(facts_fts, rowid, subject, predicate, object, context_tags, source)
          VALUES ('delete', OLD.rowid, OLD.subject, OLD.predicate, OLD.object, OLD.context_tags, OLD.source);
        END
      `);

      // Create trigger for updating FTS index after update on facts
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
          INSERT INTO facts_fts(facts_fts, rowid, subject, predicate, object, context_tags, source)
          VALUES ('delete', OLD.rowid, OLD.subject, OLD.predicate, OLD.object, OLD.context_tags, OLD.source);
          INSERT INTO facts_fts(rowid, subject, predicate, object, context_tags, source)
          VALUES (NEW.rowid, NEW.subject, NEW.predicate, NEW.object, NEW.context_tags, NEW.source);
        END
      `);

      // Create indexes for common query patterns
      db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_valid_from ON facts(valid_from)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_valid_to ON facts(valid_to)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_predicate ON facts(predicate)`);
    }
  }
];

/**
 * Applies all pending migrations to the database
 * Uses PRAGMA user_version to track which migrations have been applied
 * 
 * @param {Database} db - better-sqlite3 database instance
 */
function runMigrations(db) {
  // Get current schema version (default is 0 for new databases)
  const currentVersion = db.pragma('user_version', { simple: true });
  
  // Find migrations that need to be applied
  const pendingMigrations = MIGRATIONS.filter(m => m.version > currentVersion);
  
  if (pendingMigrations.length === 0) {
    // No migrations to apply - database is up to date
    return;
  }
  
  console.log(`[Schema] Running ${pendingMigrations.length} migration(s)...`);
  
  // Apply migrations in a transaction for atomicity
  const applyMigration = db.transaction(() => {
    for (const migration of pendingMigrations) {
      console.log(`[Schema] Applying migration to version ${migration.version}...`);
      migration.up(db);
      
      // Update user_version to reflect the applied migration
      db.pragma(`user_version = ${migration.version}`);
      console.log(`[Schema] Database now at version ${migration.version}`);
    }
  });
  
  applyMigration();
}

/**
 * Initializes the database with proper pragmas and runs migrations
 * 
 * @param {Database} db - better-sqlite3 database instance
 */
function createSchema(db) {
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Run pending migrations
  runMigrations(db);
}

/**
 * Gets a database connection with schema initialized
 * 
 * @returns {Database} better-sqlite3 database instance
 */
function getDatabase() {
  const db = new Database(DB_PATH);
  createSchema(db);
  return db;
}

export { getDatabase, createSchema, runMigrations, DB_PATH, MIGRATIONS };
