import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildContextPack,
  buildConsistencySummary,
  buildFtsSearchQuery,
  buildTokenAwareContextPack,
  chooseMaintenanceStrategy,
  detectContradictionsInFacts,
  deriveCompactionTuning,
  estimateTokens,
  isSingleValuePredicate,
  normalizePredicateName,
  normalizePredicateToken,
  getAllowedToolsForProfile,
  inferProfileFromAgentIdentity,
  inferProfileFromToolUsage,
  normalizeIdempotencyKey,
  normalizeLimit,
  parseCompactionCursor,
  parseStructuredMarkdownTriples,
  safeJsonParse,
  selectKeepFactForResolution,
  scorePromotionCandidate,
  scoreActiveFact,
  summarizePackQuality,
  validateString
} from '../src/server.js';

test('buildFtsSearchQuery places tag params before limit param', () => {
  const built = buildFtsSearchQuery('apple', 'product,mobile', 7);

  assert.ok(built);
  assert.match(built.sql, /MATCH \?/);
  assert.match(built.sql, /bm25\(facts_fts\)/);
  assert.match(built.sql, /LIKE \?/);
  assert.deepEqual(built.params, ['apple', '%product%', '%mobile%', 7]);
});

test('buildFtsSearchQuery returns null for invalid query', () => {
  assert.equal(buildFtsSearchQuery('', 'x', 10), null);
  assert.equal(buildFtsSearchQuery('   ', 'x', 10), null);
  assert.equal(buildFtsSearchQuery(null, 'x', 10), null);
});

test('validateString rejects blank inputs', () => {
  assert.throws(() => validateString('   ', 'subject'), /cannot be empty/);
  assert.equal(validateString('  Alice  ', 'subject'), 'Alice');
});

test('normalizeLimit clamps and defaults', () => {
  assert.equal(normalizeLimit(undefined, 10), 10);
  assert.equal(normalizeLimit('0', 10), 10);
  assert.equal(normalizeLimit('-2', 10), 10);
  assert.equal(normalizeLimit('5', 10), 5);
  assert.equal(normalizeLimit('20000', 10), 1000);
});

test('buildContextPack groups by subject and limits per subject', () => {
  const pack = buildContextPack([
    { subject: 'Alice', predicate: 'is', object: 'engineer' },
    { subject: 'Alice', predicate: 'uses', object: 'VS Code' },
    { subject: 'Alice', predicate: 'likes', object: 'TypeScript' },
    { subject: 'Bob', predicate: 'is', object: 'designer' }
  ], 2);

  assert.equal(pack.grouped_subjects, 2);
  assert.equal(pack.lines, 2);
  assert.match(pack.text, /Alice: is=engineer; uses=VS Code/);
  assert.doesNotMatch(pack.text, /likes=TypeScript/);
  assert.match(pack.text, /Bob: is=designer/);
});

test('estimateTokens returns positive estimate', () => {
  const shortCount = estimateTokens('abcd');
  const longCount = estimateTokens('abcdefgh');
  assert.equal(shortCount >= 1, true);
  assert.equal(longCount >= shortCount, true);
});

test('buildTokenAwareContextPack trims lines by token budget', () => {
  const records = [
    { subject: 'Alice', predicate: 'status', object: 'active' },
    { subject: 'Bob', predicate: 'status', object: 'inactive' },
    { subject: 'Carol', predicate: 'status', object: 'active' }
  ];
  const pack = buildTokenAwareContextPack(records, 1, 8);
  assert.equal(pack.trimmed, true);
  assert.equal(pack.lines >= 1, true);
  assert.equal(pack.used_token_estimate <= 8 || pack.lines === 1, true);
});

test('deriveCompactionTuning adjusts token budget from ratio history', () => {
  const tuned = deriveCompactionTuning([
    { compression_ratio: 0.85, avg_quality_score: 0.7 },
    { compression_ratio: 0.82, avg_quality_score: 0.75 }
  ], { token_budget: 500, per_subject_limit: 4 });
  assert.equal(tuned.token_budget < 500, true);
});

test('deriveCompactionTuning increases budget when over-compressed', () => {
  const tuned = deriveCompactionTuning([
    { compression_ratio: 0.2, avg_quality_score: 0.4 },
    { compression_ratio: 0.25, avg_quality_score: 0.45 }
  ], { token_budget: 500, per_subject_limit: 4 });
  assert.equal(tuned.token_budget > 500, true);
  assert.equal(tuned.per_subject_limit < 4, true);
});

test('summarizePackQuality averages selected subject scores', () => {
  const avg = summarizePackQuality([
    { subject: 'A', effective_score: 0.9 },
    { subject: 'B', effective_score: 0.5 },
    { subject: 'A', effective_score: 0.7 }
  ], ['A']);
  assert.equal(avg, 0.8);
});

test('chooseMaintenanceStrategy auto-selects highest_quality for heavy conflicts', () => {
  const strategy = chooseMaintenanceStrategy({
    contradiction_groups: 8,
    stale_active_facts: 60,
    avg_quality_score: 0.7
  });
  assert.equal(strategy, 'highest_quality');
});

test('chooseMaintenanceStrategy defaults to latest for low-signal cases', () => {
  const strategy = chooseMaintenanceStrategy({
    contradiction_groups: 1,
    stale_active_facts: 2,
    avg_quality_score: 0.4
  });
  assert.equal(strategy, 'latest');
});

test('buildConsistencySummary reports contradictions and repair hints', () => {
  const summary = buildConsistencySummary([
    { subject: 'Alice', predicate: 'status', object: 'active' },
    { subject: 'Alice', predicate: 'status', object: 'inactive' },
    { subject: 'Alice', predicate: 'knows', object: 'Bob' }
  ], new Map([['status', 'single'], ['knows', 'multi']]));
  assert.equal(summary.contradiction_groups, 1);
  assert.equal(summary.consistency_ok, false);
  assert.equal(summary.contradiction_repairs.length, 1);
});

test('parseCompactionCursor supports fallback since timestamp', () => {
  const cursor = parseCompactionCursor(null, '2026-01-01T00:00:00Z');
  assert.equal(cursor.valid_from, '2026-01-01T00:00:00Z');
  assert.equal(cursor.mode, 'since');
});

test('parseCompactionCursor parses object cursor', () => {
  const cursor = parseCompactionCursor({ valid_from: '2026-01-02T00:00:00Z', id: 'abc' }, null);
  assert.equal(cursor.valid_from, '2026-01-02T00:00:00Z');
  assert.equal(cursor.id, 'abc');
  assert.equal(cursor.mode, 'cursor');
});

test('normalizeIdempotencyKey validates and returns null for empty input', () => {
  assert.equal(normalizeIdempotencyKey(null), null);
  assert.equal(normalizeIdempotencyKey('run-1'), 'run-1');
});

test('safeJsonParse returns fallback on invalid JSON', () => {
  assert.deepEqual(safeJsonParse('{"a":1}', null), { a: 1 });
  assert.equal(safeJsonParse('not-json', 'fallback'), 'fallback');
});

test('single-value predicate registry works for mutable fields', () => {
  assert.equal(isSingleValuePredicate('status'), true);
  assert.equal(isSingleValuePredicate('prefers'), true);
  assert.equal(isSingleValuePredicate('likes'), true);
  assert.equal(isSingleValuePredicate('knows'), false);
  const policies = new Map([['knows', 'single']]);
  assert.equal(isSingleValuePredicate('knows', policies), true);
});

test('normalizePredicateToken collapses casing and spaces', () => {
  assert.equal(normalizePredicateToken('  Works At  '), 'works_at');
});

test('normalizePredicateName canonicalizes common synonyms', () => {
  assert.equal(normalizePredicateName('likes'), 'prefers');
  assert.equal(normalizePredicateName('works for'), 'works_at');
});

test('getAllowedToolsForProfile honors explicit allowlist', () => {
  const original = process.env.MEMORIX_ALLOWED_TOOLS;
  process.env.MEMORIX_ALLOWED_TOOLS = 'memorix_search_fts,memorix_get_context_pack,unknown_tool';
  const tools = [{ name: 'memorix_search_fts' }, { name: 'memorix_get_context_pack' }, { name: 'memorix_store_fact' }];
  const allowed = getAllowedToolsForProfile(tools);
  assert.equal(allowed.has('memorix_search_fts'), true);
  assert.equal(allowed.has('memorix_get_context_pack'), true);
  assert.equal(allowed.has('memorix_store_fact'), false);
  if (original === undefined) {
    delete process.env.MEMORIX_ALLOWED_TOOLS;
  } else {
    process.env.MEMORIX_ALLOWED_TOOLS = original;
  }
});

test('inferProfileFromAgentIdentity detects hermes and omoc hints', () => {
  assert.equal(inferProfileFromAgentIdentity({ agent_name: 'Hermes-Auditor' }), 'hermes');
  assert.equal(inferProfileFromAgentIdentity({ agent_role: 'execution_writer' }), 'omoc');
  assert.equal(inferProfileFromAgentIdentity({ client_name: 'generic-client' }), null);
});

test('inferProfileFromToolUsage returns confidence-scored profile', () => {
  const hermes = inferProfileFromToolUsage([
    'memorix_get_health_report',
    'memorix_run_governance_cycle',
    'memorix_detect_contradictions'
  ]);
  assert.equal(hermes.profile, 'hermes');
  assert.equal(hermes.confidence > 0.7, true);

  const omoc = inferProfileFromToolUsage([
    'memorix_store_fact',
    'memorix_store_facts',
    'memorix_auto_memorize'
  ]);
  assert.equal(omoc.profile, 'omoc');
  assert.equal(omoc.confidence > 0.7, true);
});

test('scoreActiveFact returns normalized score', () => {
  const score = scoreActiveFact({
    predicate: 'status',
    valid_from: new Date().toISOString(),
    source: 'note.md',
    context_tags: 'project,decision',
    bm25_score: 0.2
  });
  assert.equal(score >= 0 && score <= 1, true);
});

test('parseStructuredMarkdownTriples parses compact bullet memory format', () => {
  const triples = parseStructuredMarkdownTriples(`
- Alice: status=active; uses=VS Code
- ProjectX: state=in_progress
`);
  assert.deepEqual(triples, [
    { subject: 'Alice', predicate: 'status', object: 'active' },
    { subject: 'Alice', predicate: 'uses', object: 'VS Code' },
    { subject: 'ProjectX', predicate: 'state', object: 'in_progress' }
  ]);
});

test('detectContradictionsInFacts finds conflicts for single-value predicates', () => {
  const contradictions = detectContradictionsInFacts([
    { subject: 'Alice', predicate: 'status', object: 'active', valid_from: '2026-01-01T00:00:00Z' },
    { subject: 'Alice', predicate: 'status', object: 'inactive', valid_from: '2026-01-02T00:00:00Z' },
    { subject: 'Alice', predicate: 'knows', object: 'Bob', valid_from: '2026-01-03T00:00:00Z' },
    { subject: 'Alice', predicate: 'knows', object: 'Charlie', valid_from: '2026-01-04T00:00:00Z' }
  ], new Map([['status', 'single'], ['knows', 'multi']]));

  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].subject, 'Alice');
  assert.equal(contradictions[0].predicate, 'status');
  assert.equal(contradictions[0].object_count, 2);
});

test('scorePromotionCandidate returns normalized promotion score', () => {
  const score = scorePromotionCandidate({
    occurrences: 4,
    last_seen_days: 3,
    avg_quality_score: 0.8
  });
  assert.equal(score >= 0 && score <= 1, true);
  assert.equal(score > 0.4, true);
});

test('selectKeepFactForResolution supports latest strategy', () => {
  const keep = selectKeepFactForResolution([
    { id: '1', object: 'a', valid_from: '2026-01-01T00:00:00Z' },
    { id: '2', object: 'b', valid_from: '2026-02-01T00:00:00Z' }
  ], 'latest');
  assert.equal(keep.id, '2');
});

test('selectKeepFactForResolution supports highest_quality strategy', () => {
  const keep = selectKeepFactForResolution([
    { id: '1', predicate: 'status', object: 'a', valid_from: '2025-01-01T00:00:00Z', source: null, bm25_score: 0.8 },
    { id: '2', predicate: 'status', object: 'b', valid_from: new Date().toISOString(), source: 'note.md', bm25_score: 0.1 }
  ], 'highest_quality');
  assert.equal(keep.id, '2');
});
