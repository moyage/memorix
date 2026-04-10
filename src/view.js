#!/usr/bin/env node

import { getDatabase } from './schema.js';

let chalk;
try {
  chalk = await import('chalk').then(m => m.default);
} catch {
  chalk = null;
}

const c = {
  bold: (text) => chalk ? chalk.bold(text) : text,
  cyan: (text) => chalk ? chalk.cyan(text) : text,
  green: (text) => chalk ? chalk.green(text) : text,
  yellow: (text) => chalk ? chalk.yellow(text) : text,
  red: (text) => chalk ? chalk.red(text) : text,
  gray: (text) => chalk ? chalk.gray(text) : text,
  blue: (text) => chalk ? chalk.blue(text) : text,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    limit: 50,
    subject: null,
    format: 'table',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--all':
        options.all = true;
        break;
      case '--limit':
        const limitVal = parseInt(args[++i], 10);
        if (!isNaN(limitVal) && limitVal > 0) {
          options.limit = limitVal;
        }
        break;
      case '--subject':
        options.subject = args[++i];
        break;
      case '--format':
        const formatVal = args[++i];
        if (['table', 'tree'].includes(formatVal)) {
          options.format = formatVal;
        }
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
${c.bold('📚 Memorix Database Viewer')}

Usage: node src/view.js [options]

Options:
  --all              Show all facts including invalidated ones
  --limit N          Limit results to N rows (default: 50)
  --subject X        Filter by subject
  --format [table|tree]  Output format (default: table)
  --help, -h         Show this help message

Examples:
  npm run view                              # Show current facts (default)
  npm run view -- --all                     # Show all facts including history
  npm run view -- --limit 10                # Show only 10 facts
  npm run view -- --subject "Apple"         # Filter by subject
  npm run view -- --format tree             # Display as tree
`);
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTags(tags) {
  if (!tags) return '—';
  return tags.split(',').map(t => t.trim()).join(', ');
}

function isValid(fact) {
  return fact.valid_to === null;
}

function buildQuery(options) {
  let sql = 'SELECT * FROM facts';
  const conditions = [];
  const params = [];

  if (!options.all) {
    conditions.push('valid_to IS NULL');
  }

  if (options.subject) {
    conditions.push('subject = ?');
    params.push(options.subject);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY valid_from DESC';
  sql += ' LIMIT ?';
  params.push(options.limit);

  return { sql, params };
}

function displayTable(facts, options) {
  if (facts.length === 0) {
    console.log(c.yellow('\n📭 No facts found in the database.\n'));
    return;
  }

  console.log(c.cyan('\n┌' + '─'.repeat(118) + '┐'));
  console.log(c.cyan('│') + c.bold(' Subject'.padEnd(25)) + 
              c.cyan('│') + c.bold(' Predicate'.padEnd(18)) + 
              c.cyan('│') + c.bold(' Object'.padEnd(25)) + 
              c.cyan('│') + c.bold(' Tags'.padEnd(18)) + 
              c.cyan('│') + c.bold(' Source'.padEnd(14)) + 
              c.cyan('│') + c.bold(' Valid ') + c.cyan('│'));
  console.log(c.cyan('├' + '─'.repeat(118) + '┤'));

  for (const fact of facts) {
    const valid = isValid(fact) ? c.green('✓') : c.red('✗');
    const subject = (fact.subject || '').slice(0, 24).padEnd(25);
    const predicate = (fact.predicate || '').slice(0, 17).padEnd(18);
    const object = (fact.object || '').slice(0, 24).padEnd(25);
    const tags = formatTags(fact.context_tags).slice(0, 17).padEnd(18);
    const source = (fact.source || '—').slice(0, 13).padEnd(14);

    console.log(c.cyan('│') + subject + 
                c.cyan('│') + predicate + 
                c.cyan('│') + object + 
                c.cyan('│') + tags + 
                c.cyan('│') + source + 
                c.cyan('│') + '  ' + valid + '   ' + c.cyan('│'));
  }

  console.log(c.cyan('└' + '─'.repeat(118) + '┘'));
  console.log();

  console.log(c.bold('\n📋 Fact Details:'));
  console.log(c.gray('═'.repeat(60)));
  
  for (const fact of facts) {
    const status = isValid(fact) ? c.green('✓ Current') : c.red('✗ Invalidated');
    console.log(`\n${c.bold('ID:')} ${fact.id}`);
    console.log(`  ${c.bold('Subject:')}   ${fact.subject}`);
    console.log(`  ${c.bold('Predicate:')} ${fact.predicate}`);
    console.log(`  ${c.bold('Object:')}    ${fact.object}`);
    console.log(`  ${c.bold('Tags:')}      ${formatTags(fact.context_tags)}`);
    console.log(`  ${c.bold('Source:')}    ${fact.source || '—'}`);
    console.log(`  ${c.bold('Valid From:')} ${formatTimestamp(fact.valid_from)}`);
    console.log(`  ${c.bold('Valid To:')}   ${formatTimestamp(fact.valid_to)}`);
    console.log(`  ${c.bold('Status:')}    ${status}`);
  }
}

function displayTree(facts, options) {
  if (facts.length === 0) {
    console.log(c.yellow('\n📭 No facts found in the database.\n'));
    return;
  }

  console.log(c.cyan('\n📚 Memorix Facts Tree\n'));

  const bySubject = {};
  for (const fact of facts) {
    if (!bySubject[fact.subject]) {
      bySubject[fact.subject] = [];
    }
    bySubject[fact.subject].push(fact);
  }

  const subjects = Object.keys(bySubject).sort();
  
  subjects.forEach((subject, subjectIndex) => {
    const isLastSubject = subjectIndex === subjects.length - 1;
    const subjectPrefix = isLastSubject ? '└── ' : '├── ';
    const childPrefix = isLastSubject ? '    ' : '│   ';
    
    console.log(subjectPrefix + c.bold(c.cyan(subject)));
    
    const subjectFacts = bySubject[subject];
    subjectFacts.forEach((fact, factIndex) => {
      const isLastFact = factIndex === subjectFacts.length - 1;
      const factPrefix = isLastFact ? childPrefix + '└── ' : childPrefix + '├── ';
      const detailPrefix = isLastFact ? childPrefix + '    ' : childPrefix + '│   ';
      
      const valid = isValid(fact) ? c.green('✓') : c.red('✗');
      console.log(factPrefix + c.yellow(fact.predicate) + ' → ' + fact.object + ' ' + valid);
      
      if (fact.context_tags) {
        console.log(detailPrefix + c.gray(`tags: ${formatTags(fact.context_tags)}`));
      }
      if (fact.source) {
        console.log(detailPrefix + c.gray(`source: ${fact.source}`));
      }
      console.log(detailPrefix + c.gray(`from: ${formatTimestamp(fact.valid_from)}`));
      if (fact.valid_to) {
        console.log(detailPrefix + c.gray(`to: ${formatTimestamp(fact.valid_to)}`));
      }
    });
    
    if (!isLastSubject) {
      console.log();
    }
  });
}

function main() {
  const options = parseArgs();
  
  let db;
  try {
    db = getDatabase();
  } catch (error) {
    console.error(c.red(`\n❌ Error connecting to database: ${error.message}\n`));
    process.exit(1);
  }

  try {
    const countSql = options.all 
      ? 'SELECT COUNT(*) as count FROM facts'
      : 'SELECT COUNT(*) as count FROM facts WHERE valid_to IS NULL';
    const { count: totalCount } = db.prepare(countSql).get();

    let filteredCount = totalCount;
    if (options.subject) {
      const filteredSql = options.all
        ? 'SELECT COUNT(*) as count FROM facts WHERE subject = ?'
        : 'SELECT COUNT(*) as count FROM facts WHERE valid_to IS NULL AND subject = ?';
      filteredCount = db.prepare(filteredSql).get(options.subject).count;
    }

    const { sql, params } = buildQuery(options);
    const facts = db.prepare(sql).all(...params);

    console.log('\n' + c.bold(c.cyan('📚 Memorix Database View')));
    console.log(c.cyan('═'.repeat(50)));
    console.log(`${c.bold('Total facts:')} ${totalCount}`);
    if (options.subject) {
      console.log(`${c.bold('Filtered by subject:')} ${options.subject} (${filteredCount} matches)`);
    }
    console.log(`${c.bold('Showing:')} ${facts.length} of ${filteredCount}`);
    if (options.all) {
      console.log(c.yellow('⚠ Including invalidated facts'));
    }
    console.log();

    if (options.format === 'tree') {
      displayTree(facts, options);
    } else {
      displayTable(facts, options);
    }

    console.log(c.gray('─'.repeat(50)));
    console.log(c.gray(`Query: ${sql}`));
    console.log(c.gray(`Params: ${JSON.stringify(params)}`));
    console.log();

  } catch (error) {
    console.error(c.red(`\n❌ Error querying database: ${error.message}\n`));
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
