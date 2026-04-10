#!/usr/bin/env node

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.MEMORIX_DB_PATH || path.join(__dirname, '..', 'memorix.db');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    crimson: '\x1b[38m'
  },
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
    crimson: '\x1b[48m'
  }
};

function printHeader(text) {
  console.log('\n' + colors.bright + colors.fg.cyan + '═'.repeat(60) + colors.reset);
  console.log(colors.bright + colors.fg.cyan + '  ' + text + colors.reset);
  console.log(colors.bright + colors.fg.cyan + '═'.repeat(60) + colors.reset + '\n');
}

function printSubHeader(text) {
  console.log('\n' + colors.bright + colors.fg.yellow + text + colors.reset);
  console.log(colors.dim + '─'.repeat(50) + colors.reset);
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function truncate(str, maxLength = 50) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

function getDatabase() {
  try {
    const db = new Database(DB_PATH);
    return db;
  } catch (error) {
    console.error(colors.fg.red + 'Error connecting to database:' + colors.reset, error.message);
    console.error(colors.dim + 'Database path: ' + DB_PATH + colors.reset);
    process.exit(1);
  }
}

function getStatistics(db) {
  const stats = {
    activeFacts: 0,
    invalidatedFacts: 0,
    totalFacts: 0,
    uniqueSubjects: 0,
    uniquePredicates: 0,
    uniqueObjects: 0
  };

  try {
    const tableCheck = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='facts'"
    ).get();
    
    if (!tableCheck) {
      return stats;
    }

    const activeResult = db.prepare(
      'SELECT COUNT(*) as count FROM facts WHERE valid_to IS NULL'
    ).get();
    stats.activeFacts = activeResult.count;

    const invalidatedResult = db.prepare(
      'SELECT COUNT(*) as count FROM facts WHERE valid_to IS NOT NULL'
    ).get();
    stats.invalidatedFacts = invalidatedResult.count;

    stats.totalFacts = stats.activeFacts + stats.invalidatedFacts;

    const uniqueSubjectsResult = db.prepare(
      'SELECT COUNT(DISTINCT subject) as count FROM facts'
    ).get();
    stats.uniqueSubjects = uniqueSubjectsResult.count;

    const uniquePredicatesResult = db.prepare(
      'SELECT COUNT(DISTINCT predicate) as count FROM facts'
    ).get();
    stats.uniquePredicates = uniquePredicatesResult.count;

    const uniqueObjectsResult = db.prepare(
      'SELECT COUNT(DISTINCT object) as count FROM facts'
    ).get();
    stats.uniqueObjects = uniqueObjectsResult.count;

  } catch (error) {
    console.error(colors.fg.red + 'Error getting statistics:' + colors.reset, error.message);
  }

  return stats;
}

function getActiveFacts(db, limit = 100) {
  try {
    const tableCheck = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='facts'"
    ).get();
    
    if (!tableCheck) {
      return [];
    }

    const stmt = db.prepare(`
      SELECT id, subject, predicate, object, context_tags, source, valid_from
      FROM facts
      WHERE valid_to IS NULL
      ORDER BY valid_from DESC
      LIMIT ?
    `);
    
    return stmt.all(limit);
  } catch (error) {
    console.error(colors.fg.red + 'Error querying facts:' + colors.reset, error.message);
    return [];
  }
}

function getFactsBySubject(db) {
  try {
    const tableCheck = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='facts'"
    ).get();
    
    if (!tableCheck) {
      return {};
    }

    const stmt = db.prepare(`
      SELECT subject, predicate, object, context_tags
      FROM facts
      WHERE valid_to IS NULL
      ORDER BY subject, valid_from DESC
    `);
    
    const facts = stmt.all();
    const grouped = {};
    
    for (const fact of facts) {
      if (!grouped[fact.subject]) {
        grouped[fact.subject] = [];
      }
      grouped[fact.subject].push(fact);
    }
    
    return grouped;
  } catch (error) {
    console.error(colors.fg.red + 'Error querying facts by subject:' + colors.reset, error.message);
    return {};
    }
}

function displayStatistics(stats) {
  printSubHeader('📊 Database Statistics');
  
  if (stats.totalFacts === 0) {
    console.log(colors.dim + '  Database is empty. No facts stored yet.' + colors.reset);
    return;
  }

  console.log(`  ${colors.fg.green}✓ Active Facts:${colors.reset}      ${colors.bright}${stats.activeFacts}${colors.reset}`);
  console.log(`  ${colors.fg.red}✗ Invalidated Facts:${colors.reset} ${stats.invalidatedFacts}${colors.reset}`);
  console.log(`  ${colors.fg.cyan}◉ Total Facts:${colors.reset}       ${stats.totalFacts}${colors.reset}`);
  console.log();
  console.log(`  ${colors.fg.yellow}◆ Unique Subjects:${colors.reset}   ${stats.uniqueSubjects}${colors.reset}`);
  console.log(`  ${colors.fg.magenta}◇ Unique Predicates:${colors.reset} ${stats.uniquePredicates}${colors.reset}`);
  console.log(`  ${colors.fg.blue}○ Unique Objects:${colors.reset}    ${stats.uniqueObjects}${colors.reset}`);
}

function displayFactsTable(facts) {
  printSubHeader('📋 Active Facts');
  
  if (facts.length === 0) {
    console.log(colors.dim + '  No active facts found.' + colors.reset);
    return;
  }

  const tableData = facts.map(fact => ({
    'Subject': truncate(fact.subject, 25),
    'Predicate': truncate(fact.predicate, 20),
    'Object': truncate(fact.object, 30),
    'Tags': truncate(fact.context_tags, 15) || '-',
    'Valid From': formatDate(fact.valid_from)
  }));

  console.table(tableData);
  
  if (facts.length >= 100) {
    console.log(colors.dim + '\n  (Showing first 100 facts. Use database queries for more.)' + colors.reset);
  }
}

function displayTreeView(groupedFacts) {
  printSubHeader('🌳 Tree View (Grouped by Subject)');
  
  const subjects = Object.keys(groupedFacts);
  
  if (subjects.length === 0) {
    console.log(colors.dim + '  No facts to display.' + colors.reset);
    return;
  }

  for (let i = 0; i < subjects.length; i++) {
    const subject = subjects[i];
    const facts = groupedFacts[subject];
    const isLast = i === subjects.length - 1;
    const branchChar = isLast ? '└──' : '├──';
    const subBranchChar = isLast ? '    ' : '│   ';
    
    console.log(`${colors.bright}${colors.fg.cyan}${branchChar} ${subject}${colors.reset} ${colors.dim}(${facts.length} fact${facts.length !== 1 ? 's' : ''})${colors.reset}`);
    
    for (let j = 0; j < facts.length; j++) {
      const fact = facts[j];
      const isLastFact = j === facts.length - 1;
      const factBranch = isLastFact ? '└──' : '├──';
      const tagsStr = fact.context_tags ? colors.dim + ` [${fact.context_tags}]` + colors.reset : '';
      
      console.log(`${subBranchChar}${colors.fg.yellow}${factBranch} ${fact.predicate}${colors.reset}`);
      console.log(`${subBranchChar}${isLastFact ? '    ' : '│   '}   ${colors.fg.green}→ ${truncate(fact.object, 40)}${colors.reset}${tagsStr}`);
    }
    
    if (!isLast) {
      console.log();
    }
  }
}

function showHelp() {
  printHeader('Memorix Database Viewer');
  
  console.log('Usage: npm run view [options]');
  console.log();
  console.log('Options:');
  console.log('  --tree, -t       Show tree view grouped by subject');
  console.log('  --limit, -l N    Limit facts display to N rows (default: 100)');
  console.log('  --help, -h       Show this help message');
  console.log();
  console.log('Examples:');
  console.log('  npm run view                    # Show statistics and table view');
  console.log('  npm run view -- --tree          # Show tree view');
  console.log('  npm run view -- -l 50           # Limit to 50 facts');
  console.log('  npm run view -- --tree --limit 20');
  console.log();
  console.log(colors.dim + 'Database path: ' + DB_PATH + colors.reset);
}

function main() {
  const args = process.argv.slice(2);
  
  const showTree = args.includes('--tree') || args.includes('-t');
  const showHelpFlag = args.includes('--help') || args.includes('-h');
  
  let limit = 100;
  const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10) || 100;
  }
  
  if (showHelpFlag) {
    showHelp();
    process.exit(0);
  }
  
  printHeader('🧠 Memorix Database Viewer');
  console.log(colors.dim + '  Database: ' + DB_PATH + colors.reset);
  console.log();
  
  const db = getDatabase();
  
  try {
    const stats = getStatistics(db);
    displayStatistics(stats);
    
    if (showTree) {
      const groupedFacts = getFactsBySubject(db);
      displayTreeView(groupedFacts);
    } else {
      const facts = getActiveFacts(db, limit);
      displayFactsTable(facts);
    }
    
    printHeader('✓ View Complete');
    
  } catch (error) {
    console.error(colors.fg.red + '\n✗ Error:' + colors.reset, error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
