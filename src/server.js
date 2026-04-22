import { Server, StdioServerTransport } from '@modelcontextprotocol/server';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { getDatabase } from './schema.js';

function generateUUID() {
  return randomUUID();
}

const MAX_FIELD_LENGTH = 10000;
const MAX_QUERY_LENGTH = 5000;
const DEFAULT_LIMITS = {
  search: 10,
  history: 50,
  trace: 100,
  contextPack: 20,
  maintenance: 50,
  compactRecommendation: 6000,
  autoTuneWindow: 30
};
const MAX_LIMIT = 1000;
const FRESHNESS_WINDOW_DAYS = 180;
const DEFAULT_SINGLE_VALUE_PREDICATES = new Set(
  (process.env.MEMORIX_SINGLE_VALUE_PREDICATES || 'status,state,location,works_at,lives_in,preference,prefers')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.toLowerCase())
);
const require = createRequire(import.meta.url);
let tokenizerInitAttempted = false;
let tokenizerEncodingForModel = null;

function validateString(value, fieldName, maxLen = MAX_FIELD_LENGTH) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  if (value.length > maxLen) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLen}`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} cannot be empty`);
  }
  return trimmed;
}

function sanitizeFtsQuery(query) {
  if (!query || typeof query !== 'string') {
    return null;
  }
  let sanitized = query.slice(0, MAX_QUERY_LENGTH);
  const openQuotes = (sanitized.match(/"/g) || []).length;
  if (openQuotes % 2 !== 0) {
    sanitized = sanitized.replace(/"/g, '');
  }
  sanitized = sanitized.replace(/\\/g, '');
  sanitized = sanitized.trim();
  return sanitized || null;
}

function normalizeLimit(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function buildFtsSearchQuery(query, contextTags, rawLimit) {
  const sanitizedQuery = sanitizeFtsQuery(query);
  if (!sanitizedQuery) {
    return null;
  }

  const limit = normalizeLimit(rawLimit, DEFAULT_LIMITS.search);
  const params = [sanitizedQuery];
  let sql = `
    SELECT f.id, f.subject, f.predicate, f.object, f.context_tags, f.source, f.valid_from, bm25(facts_fts) AS bm25_score
    FROM facts f
    JOIN facts_fts fts ON f.rowid = fts.rowid
    WHERE facts_fts MATCH ?
    AND f.valid_to IS NULL
  `;

  if (typeof contextTags === 'string' && contextTags.trim()) {
    const tags = contextTags.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (tags.length > 0) {
      const tagConditions = tags.map(() => 'f.context_tags LIKE ?').join(' AND ');
      sql += ` AND (${tagConditions})`;
      params.push(...tags.map((tag) => `%${tag}%`));
    }
  }

  sql += ' ORDER BY rank LIMIT ?';
  params.push(limit);
  return { sql, params };
}

function normalizeOptionalString(value, fieldName, maxLen = MAX_FIELD_LENGTH) {
  if (value === undefined || value === null) {
    return null;
  }
  return validateString(value, fieldName, maxLen);
}

function normalizeContextTags(contextTags) {
  const raw = normalizeOptionalString(contextTags, 'context_tags');
  if (!raw) {
    return null;
  }
  const tags = [...new Set(raw.split(',').map((tag) => tag.trim()).filter(Boolean))];
  return tags.length > 0 ? tags.join(',') : null;
}

function buildContextPack(records, perSubjectLimit = 4) {
  const grouped = new Map();

  for (const row of records) {
    if (!grouped.has(row.subject)) {
      grouped.set(row.subject, []);
    }
    const bucket = grouped.get(row.subject);
    if (bucket.length < perSubjectLimit) {
      bucket.push(row);
    }
  }

  const lines = [];
  for (const [subject, facts] of grouped.entries()) {
    const factText = facts.map((fact) => `${fact.predicate}=${fact.object}`).join('; ');
    lines.push(`- ${subject}: ${factText}`);
  }

  return {
    grouped_subjects: grouped.size,
    lines: lines.length,
    text: lines.join('\n')
  };
}

function tryInitializeTokenizer() {
  if (tokenizerInitAttempted) {
    return;
  }
  tokenizerInitAttempted = true;
  try {
    const tiktoken = require('js-tiktoken');
    if (typeof tiktoken.encodingForModel === 'function') {
      tokenizerEncodingForModel = tiktoken.encodingForModel;
    }
  } catch {
    tokenizerEncodingForModel = null;
  }
}

function estimateTokens(text, model = 'gpt-4o-mini') {
  const content = String(text || '');
  if (!content) {
    return 1;
  }

  tryInitializeTokenizer();
  if (tokenizerEncodingForModel) {
    try {
      const encoding = tokenizerEncodingForModel(model);
      const count = encoding.encode(content).length;
      if (typeof encoding.free === 'function') {
        encoding.free();
      }
      return Math.max(1, count);
    } catch {
      // Fall through to heuristic estimate when model lookup fails.
    }
  }

  const asciiWords = (content.match(/[A-Za-z0-9_]+/g) || []).length;
  const cjkChars = (content.match(/[\u3400-\u9FFF]/g) || []).length;
  const symbols = Math.max(0, content.length - asciiWords * 4 - cjkChars);
  const heuristic = asciiWords * 1.3 + cjkChars * 1.1 + symbols * 0.25;
  return Math.max(1, Math.ceil(heuristic));
}

function buildTokenAwareContextPack(records, perSubjectLimit = 4, tokenBudget = null) {
  const basePack = buildContextPack(records, perSubjectLimit);
  const allSubjects = basePack.text
    ? basePack.text.split('\n').filter(Boolean).map((line) => line.replace(/^\-\s*/, '').split(':')[0]?.trim()).filter(Boolean)
    : [];
  if (!tokenBudget) {
    return {
      ...basePack,
      used_token_estimate: estimateTokens(basePack.text),
      token_budget: null,
      trimmed: false,
      selected_subjects: allSubjects
    };
  }

  const lines = basePack.text ? basePack.text.split('\n').filter(Boolean) : [];
  const selected = [];
  let used = 0;
  for (const line of lines) {
    const lineTokens = estimateTokens(line + '\n');
    if (selected.length > 0 && used + lineTokens > tokenBudget) {
      break;
    }
    if (selected.length === 0 && lineTokens > tokenBudget) {
      selected.push(line);
      used += lineTokens;
      break;
    }
    selected.push(line);
    used += lineTokens;
  }

  return {
    grouped_subjects: selected.length,
    lines: selected.length,
    text: selected.join('\n'),
    used_token_estimate: used,
    token_budget: tokenBudget,
    trimmed: selected.length < lines.length,
    selected_subjects: selected.map((line) => line.replace(/^\-\s*/, '').split(':')[0]?.trim()).filter(Boolean)
  };
}

function isSingleValuePredicate(predicate, policyMap) {
  if (!predicate) {
    return false;
  }
  const normalized = String(predicate).trim().toLowerCase();
  if (policyMap && policyMap.has(normalized)) {
    return policyMap.get(normalized) === 'single';
  }
  return DEFAULT_SINGLE_VALUE_PREDICATES.has(normalized);
}

function scoreActiveFact(fact) {
  const createdAt = fact.valid_from ? new Date(fact.valid_from).getTime() : Date.now();
  const ageDays = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60 * 24));
  const freshnessScore = Math.max(0, 1 - ageDays / FRESHNESS_WINDOW_DAYS);
  const sourceScore = fact.source ? 0.08 : 0;
  const tagScore = fact.context_tags ? 0.05 : 0;
  const predicateScore = isSingleValuePredicate(fact.predicate) ? 0.06 : 0;
  const relevanceScore = Number.isFinite(fact.bm25_score) ? 1 / (1 + Math.max(0, fact.bm25_score)) : 0.5;
  const score = 0.35 + freshnessScore * 0.25 + relevanceScore * 0.26 + sourceScore + tagScore + predicateScore;
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function enrichFactsWithQuality(facts) {
  return facts.map((fact) => ({
    ...fact,
    quality_score: scoreActiveFact(fact)
  }));
}

function parseStructuredMarkdownTriples(text) {
  const triples = [];
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s*([^:]+):\s*(.+)\s*$/);
    if (!match) {
      continue;
    }
    const subject = match[1].trim();
    const facts = match[2].split(';').map((part) => part.trim()).filter(Boolean);
    for (const item of facts) {
      const pair = item.match(/^([^=]+)=(.+)$/);
      if (!pair) {
        continue;
      }
      triples.push({
        subject,
        predicate: pair[1].trim(),
        object: pair[2].trim()
      });
    }
  }
  return triples;
}

function detectContradictionsInFacts(facts, policyMap) {
  const groups = new Map();

  for (const fact of facts) {
    const predicate = String(fact.predicate || '').trim().toLowerCase();
    if (!isSingleValuePredicate(predicate, policyMap)) {
      continue;
    }
    const key = `${String(fact.subject || '').trim().toLowerCase()}|${predicate}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(fact);
  }

  const contradictions = [];
  for (const group of groups.values()) {
    const uniqueObjects = [...new Set(group.map((fact) => String(fact.object || '').trim().toLowerCase()))];
    if (uniqueObjects.length > 1) {
      contradictions.push({
        subject: group[0].subject,
        predicate: group[0].predicate,
        object_count: uniqueObjects.length,
        fact_count: group.length,
        facts: group.sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')))
      });
    }
  }

  return contradictions.sort((a, b) => b.object_count - a.object_count);
}

function scorePromotionCandidate(candidate) {
  const count = Math.max(1, Number(candidate.occurrences || 1));
  const recencyDays = Math.max(0, Number(candidate.last_seen_days || 0));
  const recencyScore = Math.max(0, 1 - recencyDays / 90);
  const countScore = Math.min(1, Math.log2(count + 1) / 4);
  const qualityScore = Number(candidate.avg_quality_score || 0.5);
  const score = countScore * 0.45 + recencyScore * 0.25 + qualityScore * 0.3;
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

function summarizePackQuality(scoredRows, selectedSubjects) {
  if (!Array.isArray(scoredRows) || scoredRows.length === 0) {
    return 0;
  }
  const subjectSet = new Set((selectedSubjects || []).map((s) => String(s).toLowerCase()));
  const selected = subjectSet.size > 0
    ? scoredRows.filter((row) => subjectSet.has(String(row.subject).toLowerCase()))
    : scoredRows;
  if (selected.length === 0) {
    return 0;
  }
  const avg = selected.reduce((sum, row) => sum + Number(row.effective_score ?? row.quality_score ?? 0), 0) / selected.length;
  return Number(avg.toFixed(4));
}

function deriveCompactionTuning(events, fallback = { token_budget: 500, per_subject_limit: 4 }) {
  if (!Array.isArray(events) || events.length === 0) {
    return { ...fallback, basis_events: 0 };
  }
  const ratios = events.map((e) => Number(e.compression_ratio || 1)).filter((n) => Number.isFinite(n) && n > 0);
  const avgRatio = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
  const avgQuality = events.reduce((a, e) => a + Number(e.avg_quality_score || 0), 0) / events.length;

  let tokenBudget = fallback.token_budget;
  let perSubjectLimit = fallback.per_subject_limit;

  if (avgRatio > 0.75) {
    tokenBudget = Math.max(300, Math.round(tokenBudget * 0.85));
  } else if (avgRatio < 0.35) {
    tokenBudget = Math.min(2000, Math.round(tokenBudget * 1.15));
  }

  if (avgQuality < 0.55) {
    perSubjectLimit = Math.max(2, perSubjectLimit - 1);
  } else if (avgQuality > 0.8) {
    perSubjectLimit = Math.min(8, perSubjectLimit + 1);
  }

  return {
    token_budget: tokenBudget,
    per_subject_limit: perSubjectLimit,
    basis_events: events.length,
    avg_compression_ratio: Number(avgRatio.toFixed(4)),
    avg_quality_score: Number(avgQuality.toFixed(4))
  };
}

function parseCompactionCursor(rawCursor, fallbackSince = null) {
  if (!rawCursor) {
    return fallbackSince ? { valid_from: fallbackSince, id: '00000000-0000-0000-0000-000000000000', mode: 'since' } : null;
  }
  if (typeof rawCursor === 'object') {
    const validFrom = rawCursor.valid_from ? String(rawCursor.valid_from) : null;
    const id = rawCursor.id ? String(rawCursor.id) : null;
    if (!validFrom || !id) {
      throw new Error('cursor must include valid_from and id');
    }
    return { valid_from: validFrom, id, mode: 'cursor' };
  }
  if (typeof rawCursor === 'string') {
    try {
      const parsed = JSON.parse(rawCursor);
      return parseCompactionCursor(parsed, fallbackSince);
    } catch {
      throw new Error('cursor must be a JSON object or object');
    }
  }
  throw new Error('cursor must be an object or JSON string');
}

function safeJsonParse(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeIdempotencyKey(value) {
  if (value === undefined || value === null) {
    return null;
  }
  return validateString(String(value), 'idempotency_key', 128);
}

function selectKeepFactForResolution(facts, strategy = 'latest', keepObject = null) {
  if (!Array.isArray(facts) || facts.length === 0) {
    return null;
  }
  if (keepObject) {
    const match = facts.find((fact) => String(fact.object).trim() === keepObject);
    if (match) {
      return match;
    }
    return null;
  }
  if (strategy === 'highest_quality') {
    const enriched = enrichFactsWithQuality(facts);
    return [...enriched].sort((a, b) => b.quality_score - a.quality_score || String(b.valid_from || '').localeCompare(String(a.valid_from || '')))[0];
  }
  return [...facts].sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')))[0];
}

function chooseMaintenanceStrategy(context = {}) {
  const contradictionGroups = Number(context.contradiction_groups || 0);
  const avgQuality = Number(context.avg_quality_score || 0);
  const staleCount = Number(context.stale_active_facts || 0);
  const highConflict = contradictionGroups >= 5;
  const highStale = staleCount >= 50;

  if ((highConflict || highStale) && avgQuality >= 0.62) {
    return 'highest_quality';
  }
  return 'latest';
}

function buildConsistencySummary(activeFacts, policyMap) {
  const contradictions = detectContradictionsInFacts(activeFacts, policyMap);
  const singlePredicates = new Set();
  const multiPredicates = new Set();
  for (const [predicate, mode] of policyMap.entries()) {
    if (mode === 'single') {
      singlePredicates.add(predicate);
    } else {
      multiPredicates.add(predicate);
    }
  }

  const activePredicates = new Set(activeFacts.map((fact) => String(fact.predicate || '').toLowerCase()));
  const unusedSinglePolicies = [...singlePredicates].filter((predicate) => !activePredicates.has(predicate));
  const contradictionRepairs = contradictions.map((group) => ({
    subject: group.subject,
    predicate: group.predicate,
    recommendation: 'run_maintenance_sweep_or_governance_cycle'
  }));

  return {
    contradiction_groups: contradictions.length,
    contradiction_repairs: contradictionRepairs,
    unused_single_policies: unusedSinglePolicies,
    active_fact_count: activeFacts.length,
    consistency_ok: contradictions.length === 0
  };
}

function createServer() {
  const db = getDatabase();

  const storeFactTool = {
    name: 'memorix_store_fact',
    description: `Store a new temporal triple (fact) into memory.

**Arguments**:
- subject (string): The entity being described
- predicate (string): The relationship or action
- object (string): The target or value
- context_tags (string, optional): Comma-separated tags for context
- source (string, optional): Context or file path origin
- replace_existing (boolean, optional): Invalidate active facts with same subject+predicate before insert

**Few-Shot Examples**:
- Good: (Apple, launch_plan, iPhone 16) — specific, actionable
- Bad: (Apple, plans to release, a phone) — vague, non-specific
- Good: (User, prefers, dark_mode) — clear preference
- Bad: (User, likes, things) — ambiguous object
- Good: (Project, status, in_progress) — precise state`,
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'The entity being described' },
        predicate: { type: 'string', description: 'The relationship or action' },
        object: { type: 'string', description: 'The target or value' },
        context_tags: { type: 'string', description: 'Comma-separated tags for context', optional: true },
        source: { type: 'string', description: 'Context or file path origin', optional: true },
        replace_existing: { type: 'boolean', description: 'Invalidate active facts with same subject+predicate before insert', optional: true }
      },
      required: ['subject', 'predicate', 'object']
    }
  };

  const storeFactsTool = {
    name: 'memorix_store_facts',
    description: `Batch store multiple temporal triples into the database in a single transaction.

**Arguments**:
- facts (array): Array of fact objects, each containing:
  - subject (string): The entity being described
  - predicate (string): The relationship or action
  - object (string): The target or value
  - context_tags (string, optional): Comma-separated tags
  - source (string, optional): Context or file path origin
- replace_existing (boolean, optional): Invalidate active facts with same subject+predicate before insert

**Behavior**: Batch inserts all facts within a single transaction, setting valid_from to current time for each.

**Use Case**: Efficient bulk import of knowledge triples.`,
    inputSchema: {
      type: 'object',
      properties: {
        facts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              subject: { type: 'string' },
              predicate: { type: 'string' },
              object: { type: 'string' },
              context_tags: { type: 'string', optional: true },
              source: { type: 'string', optional: true },
              replace_existing: { type: 'boolean', optional: true }
            },
            required: ['subject', 'predicate', 'object']
          }
        },
        replace_existing: { type: 'boolean', optional: true }
      },
      required: ['facts']
    }
  };

  const searchFtsTool = {
    name: 'memorix_search_fts',
    description: `Search memory using FTS5 full-text search.

**Arguments**:
- query (string): The search string (supports FTS5 syntax including prefix matching with *)
- context_tags (string, optional): Filter by specific context tags (comma-separated)
- limit (integer, default: 10): Max results

**Few-Shot Examples**:
- Query: "iPhone" → Matches (Apple, launch_plan, iPhone 16)
- Query: "dark*" → Matches (User, prefers, dark_mode) via stemming
- Query: "Apple" context_tags="product" → Filters by tag`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search string (supports FTS5 syntax)' },
        context_tags: { type: 'string', description: 'Filter by specific context tags (comma-separated)', optional: true },
        limit: { type: 'integer', description: 'Max results', default: 10 }
      },
      required: ['query']
    }
  };

  const invalidateFactTool = {
    name: 'memorix_invalidate_fact',
    description: `Mark a fact as no longer valid without deleting history.

**Arguments**:
- id (string): The UUID of the fact

**Behavior**: Sets valid_to to CURRENT_TIMESTAMP, effectively removing it from current state lookups while preserving audit history.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The UUID of the fact to invalidate' }
      },
      required: ['id']
    }
  };

  const queryHistoryTool = {
    name: 'memorix_query_history',
    description: `Query past state of the knowledge graph using temporal timestamps.

**Arguments**:
- valid_to (string): The timestamp to query. Returns facts that were valid at this point in time
- subject (string, optional): Filter by subject
- limit (integer, default: 50): Max results

**Behavior**: Returns historical facts that were active at the specified point in time.

**Use Case**: Reconstructing state at a past timestamp, audit trails, rollback analysis.`,
    inputSchema: {
      type: 'object',
      properties: {
        valid_to: { type: 'string', description: 'The timestamp to query' },
        subject: { type: 'string', description: 'Filter by subject', optional: true },
        limit: { type: 'integer', description: 'Max results', default: 50 }
      },
      required: ['valid_to']
    }
  };

  const traceRelationsTool = {
    name: 'memorix_trace_relations',
    description: `Graph traversal using Recursive CTEs up to 3 hops.

**Arguments**:
- start_subject (string): The starting entity
- predicate_filter (string, optional): Only follow edges matching this predicate
- max_hops (integer, default: 3, max: 3): Maximum traversal depth
- limit (integer, default: 100): Max results

**Behavior**: Performs recursive CTE traversal to find connected entities up to 3 hops away.

**Use Case**: Finding indirect relationships, chain-of-thought tracing, dependency analysis.

**Example**:
- Query: (A, knows, B), (B, knows, C), (C, works_at, D)
- Input: start_subject="A", max_hops=3
- Output: [(A, knows, B), (B, knows, C), (C, works_at, D)]`,
    inputSchema: {
      type: 'object',
      properties: {
        start_subject: { type: 'string', description: 'The starting entity' },
        predicate_filter: { type: 'string', description: 'Only follow edges matching this predicate', optional: true },
        max_hops: { type: 'integer', description: 'Maximum traversal depth (max: 3)', default: 3 },
        limit: { type: 'integer', description: 'Max results', default: 100 }
      },
      required: ['start_subject']
    }
  };

  const autoMemorizeTool = {
    name: 'memorix_auto_memorize',
    description: `Automatically extract subject-predicate-object triples from long text and store them as facts.

**Arguments**:
- text (string): Long text to analyze and extract triples from
- context_tags (string, optional): Tags to apply to all extracted facts
- source (string, optional): Origin or context of the text

**Behavior**: Parses text using pattern heuristics to identify semantic relationships (e.g., "X is Y", "X has Y", "X prefers Y", "X uses Y"), validates extracted triples, and stores them in the database.

**Use Case**: Bulk ingestion of knowledge from documents, notes, or conversations without manual triple extraction.

**Example**:
- Input: "Alice is a software engineer. She prefers dark mode. She uses VS Code."
- Extracted: [(Alice, is, software engineer), (Alice, prefers, dark mode), (Alice, uses, VS Code)]
- Output: { extracted: 3, stored: 3, triples: [...] }`,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Long text to analyze and extract triples from' },
        context_tags: { type: 'string', description: 'Tags to apply to all extracted facts', optional: true },
        source: { type: 'string', description: 'Origin or context of the text', optional: true },
        replace_existing: { type: 'boolean', description: 'Invalidate active facts with same subject+predicate before insert', optional: true }
      },
      required: ['text']
    }
  };

  const contextPackTool = {
    name: 'memorix_get_context_pack',
    description: `Create a compact, high-signal memory pack for long-running sessions.

**Arguments**:
- query (string, optional): FTS query for scoped retrieval
- subject (string, optional): Restrict to one subject
- context_tags (string, optional): Filter by tags
- limit (integer, default: 20): Maximum retrieved rows before compaction
- per_subject_limit (integer, default: 4): Max facts per subject in final pack
- token_budget (integer, optional): Approximate output token budget
- since_valid_from (string, optional): Incremental mode, only include facts >= timestamp
- cursor (object|string, optional): Cursor object from previous response for deterministic pagination
- prioritize_contradictions (boolean, optional): Boost contradictory single-value predicates in output order

**Behavior**: Returns grouped compact lines suitable for reinjecting into constrained context windows.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'FTS query for scoped retrieval', optional: true },
        subject: { type: 'string', description: 'Restrict to one subject', optional: true },
        context_tags: { type: 'string', description: 'Filter by tags', optional: true },
        limit: { type: 'integer', description: 'Maximum retrieved rows', default: 20, optional: true },
        per_subject_limit: { type: 'integer', description: 'Max facts per subject in compact output', default: 4, optional: true },
        token_budget: { type: 'integer', description: 'Approximate output token budget', optional: true },
        since_valid_from: { type: 'string', description: 'Incremental mode lower bound timestamp', optional: true },
        cursor: { type: 'string', description: 'Cursor JSON from previous call', optional: true },
        prioritize_contradictions: { type: 'boolean', description: 'Boost contradiction groups in ranking', optional: true }
      }
    }
  };

  const importMarkdownTool = {
    name: 'memorix_import_markdown',
    description: `Import OpenClaw-style markdown memory into Memorix.

**Arguments**:
- text (string, optional): Markdown content to import
- source_path (string, optional): Local markdown file path to read and import
- context_tags (string, optional): Tags applied to imported facts
- source (string, optional): Source override
- replace_existing (boolean, optional): Apply replacement policy for mutable predicates`,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', optional: true },
        source_path: { type: 'string', optional: true },
        context_tags: { type: 'string', optional: true },
        source: { type: 'string', optional: true },
        replace_existing: { type: 'boolean', optional: true }
      }
    }
  };

  const exportMarkdownTool = {
    name: 'memorix_export_markdown',
    description: `Export active facts into markdown compatible with OpenClaw memory files.

**Arguments**:
- subject (string, optional): Filter by subject
- context_tags (string, optional): Filter by tags
- limit (integer, default: 100): Max facts to export
- mode (string, optional): memory (grouped compact) or daily (chronological bullet list)`,
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', optional: true },
        context_tags: { type: 'string', optional: true },
        limit: { type: 'integer', default: 100, optional: true },
        mode: { type: 'string', optional: true }
      }
    }
  };

  const getPredicatePoliciesTool = {
    name: 'memorix_get_predicate_policies',
    description: `Read predicate write policies used for conflict control.

**Arguments**:
- predicate (string, optional): Return one specific predicate policy only`,
    inputSchema: {
      type: 'object',
      properties: {
        predicate: { type: 'string', optional: true }
      }
    }
  };

  const setPredicatePolicyTool = {
    name: 'memorix_set_predicate_policy',
    description: `Set predicate policy to single or multi.

**Arguments**:
- predicate (string, required): Predicate name
- mode (string, required): single or multi`,
    inputSchema: {
      type: 'object',
      properties: {
        predicate: { type: 'string' },
        mode: { type: 'string' }
      },
      required: ['predicate', 'mode']
    }
  };

  const detectContradictionsTool = {
    name: 'memorix_detect_contradictions',
    description: `Detect active contradictions for predicates configured as single-value.

**Arguments**:
- subject (string, optional): Filter by subject
- predicate (string, optional): Filter by predicate
- limit (integer, default: 100): Max returned contradiction groups`,
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', optional: true },
        predicate: { type: 'string', optional: true },
        limit: { type: 'integer', default: 100, optional: true }
      }
    }
  };

  const resolveContradictionTool = {
    name: 'memorix_resolve_contradiction',
    description: `Resolve one subject+predicate contradiction by keeping one fact active.

**Arguments**:
- subject (string, required)
- predicate (string, required)
- keep_object (string, optional): Keep this object active
- keep_latest (boolean, optional, default: true): keep newest if keep_object not provided`,
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        predicate: { type: 'string' },
        keep_object: { type: 'string', optional: true },
        keep_latest: { type: 'boolean', optional: true }
      },
      required: ['subject', 'predicate']
    }
  };

  const rollbackResolutionTool = {
    name: 'memorix_rollback_resolution',
    description: `Rollback a previous contradiction resolution and reactivate invalidated facts.

**Arguments**:
- resolution_id (string, required): Resolution event id returned by resolve tool`,
    inputSchema: {
      type: 'object',
      properties: {
        resolution_id: { type: 'string' }
      },
      required: ['resolution_id']
    }
  };

  const rankPromotionCandidatesTool = {
    name: 'memorix_rank_promotion_candidates',
    description: `Rank active fact candidates for deterministic promotion into durable memory workflows.

**Arguments**:
- since_days (integer, optional, default: 30): Lookback window
- min_occurrences (integer, optional, default: 1): Minimum recurring count
- limit (integer, optional, default: 50)`,
    inputSchema: {
      type: 'object',
      properties: {
        since_days: { type: 'integer', optional: true, default: 30 },
        min_occurrences: { type: 'integer', optional: true, default: 1 },
        limit: { type: 'integer', optional: true, default: 50 }
      }
    }
  };

  const healthReportTool = {
    name: 'memorix_get_health_report',
    description: `Return memory health metrics for long-running sessions.

**Arguments**:
- stale_days (integer, optional, default: 180): Threshold for stale active facts`,
    inputSchema: {
      type: 'object',
      properties: {
        stale_days: { type: 'integer', optional: true, default: 180 }
      }
    }
  };

  const maintenanceSweepTool = {
    name: 'memorix_run_maintenance_sweep',
    description: `Run contradiction maintenance sweep for single-value predicates.

**Arguments**:
- dry_run (boolean, optional, default: true): if true, only return planned actions
- limit (integer, optional, default: 50): max contradiction groups to process
- subject (string, optional): restrict to one subject
- predicate (string, optional): restrict to one predicate`,
    inputSchema: {
      type: 'object',
      properties: {
        dry_run: { type: 'boolean', optional: true },
        limit: { type: 'integer', optional: true, default: 50 },
        subject: { type: 'string', optional: true },
        predicate: { type: 'string', optional: true }
      }
    }
  };

  const compactionRecommendationTool = {
    name: 'memorix_recommend_compaction',
    description: `Recommend whether to run context compaction now, based on context pressure and memory health.

**Arguments**:
- current_context_tokens (integer, optional): Current estimated tokens in active conversation context
- token_threshold (integer, optional, default: 6000): Threshold for proactive compaction
- stale_days (integer, optional, default: 180): Staleness threshold for health check
- contradiction_threshold (integer, optional, default: 1): Minimum contradiction groups to trigger recommendation`,
    inputSchema: {
      type: 'object',
      properties: {
        current_context_tokens: { type: 'integer', optional: true },
        token_threshold: { type: 'integer', optional: true, default: 6000 },
        stale_days: { type: 'integer', optional: true, default: 180 },
        contradiction_threshold: { type: 'integer', optional: true, default: 1 }
      }
    }
  };

  const compactNowTool = {
    name: 'memorix_compact_context_now',
    description: `One-shot compaction pipeline: recommend -> compact -> telemetry record.

**Arguments**:
- current_context_tokens (integer, optional)
- token_threshold (integer, optional, default: 6000)
- query (string, optional)
- subject (string, optional)
- context_tags (string, optional)
- since_valid_from (string, optional)
- prioritize_contradictions (boolean, optional, default: true)
- token_budget (integer, optional, default: 500)
- per_subject_limit (integer, optional, default: 4)
- limit (integer, optional, default: 20)
- force (boolean, optional): compact even if recommendation is false`,
    inputSchema: {
      type: 'object',
      properties: {
        current_context_tokens: { type: 'integer', optional: true },
        token_threshold: { type: 'integer', optional: true, default: 6000 },
        query: { type: 'string', optional: true },
        subject: { type: 'string', optional: true },
        context_tags: { type: 'string', optional: true },
        since_valid_from: { type: 'string', optional: true },
        prioritize_contradictions: { type: 'boolean', optional: true },
        token_budget: { type: 'integer', optional: true, default: 500 },
        per_subject_limit: { type: 'integer', optional: true, default: 4 },
        limit: { type: 'integer', optional: true, default: 20 },
        force: { type: 'boolean', optional: true }
      }
    }
  };

  const autotuneCompactionTool = {
    name: 'memorix_autotune_compaction_params',
    description: `Auto-tune compaction defaults from compaction telemetry history.

**Arguments**:
- window (integer, optional, default: 30): Number of recent events to analyze`,
    inputSchema: {
      type: 'object',
      properties: {
        window: { type: 'integer', optional: true, default: 30 }
      }
    }
  };

  const governanceCycleTool = {
    name: 'memorix_run_governance_cycle',
    description: `Run an end-to-end governance cycle for long-running sessions.

**Flow**:
1) Evaluate compaction recommendation
2) Optionally run compaction
3) Run maintenance sweep (dry-run or apply)

**Arguments**:
- dry_run (boolean, optional, default: true)
- force_compaction (boolean, optional): run compaction even if recommendation is false
- run_maintenance (boolean, optional, default: true)
- idempotency_key (string, optional): Deduplicate repeated governance invocations
- resume_failed (boolean, optional): Resume previously failed run with same idempotency key
- current_context_tokens (integer, optional)
- token_threshold (integer, optional, default: 6000)
- token_budget (integer, optional)
- per_subject_limit (integer, optional)
- limit (integer, optional, default: 20)
- since_valid_from (string, optional)
- prioritize_contradictions (boolean, optional, default: true)`,
    inputSchema: {
      type: 'object',
      properties: {
        dry_run: { type: 'boolean', optional: true },
        force_compaction: { type: 'boolean', optional: true },
        run_maintenance: { type: 'boolean', optional: true },
        idempotency_key: { type: 'string', optional: true },
        resume_failed: { type: 'boolean', optional: true },
        current_context_tokens: { type: 'integer', optional: true },
        token_threshold: { type: 'integer', optional: true },
        token_budget: { type: 'integer', optional: true },
        per_subject_limit: { type: 'integer', optional: true },
        limit: { type: 'integer', optional: true },
        since_valid_from: { type: 'string', optional: true },
        prioritize_contradictions: { type: 'boolean', optional: true }
      }
    }
  };

  const governanceRunStatusTool = {
    name: 'memorix_get_governance_run',
    description: `Get governance run status by run id or idempotency key.`,
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', optional: true },
        idempotency_key: { type: 'string', optional: true }
      }
    }
  };

  const consistencyCheckTool = {
    name: 'memorix_check_consistency',
    description: `Run consistency checks for active memory and policy alignment.

**Arguments**:
- subject (string, optional): Restrict checks to one subject
- predicate (string, optional): Restrict checks to one predicate`,
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', optional: true },
        predicate: { type: 'string', optional: true }
      }
    }
  };

  const server = new Server({
    name: 'memorix',
    version: '2.1.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  server.setRequestHandler('tools/list', async () => {
    return {
      tools: [
        storeFactTool,
        storeFactsTool,
        searchFtsTool,
        invalidateFactTool,
        queryHistoryTool,
        traceRelationsTool,
        autoMemorizeTool,
        contextPackTool,
        importMarkdownTool,
        exportMarkdownTool,
        getPredicatePoliciesTool,
        setPredicatePolicyTool,
        detectContradictionsTool,
        resolveContradictionTool,
        rollbackResolutionTool,
        rankPromotionCandidatesTool,
        healthReportTool,
        maintenanceSweepTool,
        compactionRecommendationTool,
        compactNowTool,
        autotuneCompactionTool,
        governanceCycleTool,
        consistencyCheckTool,
        governanceRunStatusTool
      ]
    };
  });

  const insertFactStmt = db.prepare(`
    INSERT INTO facts (id, subject, predicate, object, context_tags, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const findActiveExactStmt = db.prepare(`
    SELECT id
    FROM facts
    WHERE subject = ? AND predicate = ? AND object = ? AND valid_to IS NULL
    LIMIT 1
  `);
  const invalidatePredicateStmt = db.prepare(`
    UPDATE facts
    SET valid_to = CURRENT_TIMESTAMP
    WHERE subject = ? AND predicate = ? AND valid_to IS NULL
  `);
  const upsertPredicatePolicyStmt = db.prepare(`
    INSERT INTO predicate_policies (predicate, mode, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(predicate) DO UPDATE SET mode = excluded.mode, updated_at = CURRENT_TIMESTAMP
  `);
  const getPredicatePolicyStmt = db.prepare(`
    SELECT predicate, mode, updated_at
    FROM predicate_policies
    WHERE predicate = ?
  `);
  const getPredicatePoliciesStmt = db.prepare(`
    SELECT predicate, mode, updated_at
    FROM predicate_policies
    ORDER BY predicate ASC
  `);
  const getActiveFactsForContradictionsStmt = db.prepare(`
    SELECT id, subject, predicate, object, context_tags, source, valid_from
    FROM facts
    WHERE valid_to IS NULL
  `);
  const getActiveFactsBySubjectPredicateStmt = db.prepare(`
    SELECT id, subject, predicate, object, context_tags, source, valid_from
    FROM facts
    WHERE valid_to IS NULL AND subject = ? AND predicate = ?
    ORDER BY valid_from DESC
  `);
  const invalidateFactByIdStmt = db.prepare(`
    UPDATE facts
    SET valid_to = CURRENT_TIMESTAMP
    WHERE id = ? AND valid_to IS NULL
  `);
  const rankPromotionCandidatesStmt = db.prepare(`
    SELECT
      subject,
      predicate,
      object,
      COUNT(*) AS occurrences,
      MAX(valid_from) AS last_seen,
      MIN(valid_from) AS first_seen,
      AVG(CASE WHEN source IS NOT NULL THEN 0.8 ELSE 0.5 END) AS avg_quality_score
    FROM facts
    WHERE valid_to IS NULL
      AND datetime(valid_from) >= datetime('now', ?)
    GROUP BY subject, predicate, object
    HAVING COUNT(*) >= ?
    ORDER BY occurrences DESC, last_seen DESC
    LIMIT ?
  `);
  const countFactsByValidityStmt = db.prepare(`
    SELECT
      SUM(CASE WHEN valid_to IS NULL THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN valid_to IS NOT NULL THEN 1 ELSE 0 END) AS invalidated_count
    FROM facts
  `);
  const countDistinctSubjectsStmt = db.prepare(`
    SELECT COUNT(DISTINCT subject) AS count
    FROM facts
    WHERE valid_to IS NULL
  `);
  const countDistinctPredicatesStmt = db.prepare(`
    SELECT COUNT(DISTINCT predicate) AS count
    FROM facts
    WHERE valid_to IS NULL
  `);
  const insertContradictionResolutionStmt = db.prepare(`
    INSERT INTO contradiction_resolutions (
      id, subject, predicate, strategy, kept_fact_id, invalidated_fact_ids, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const getResolutionByIdStmt = db.prepare(`
    SELECT *
    FROM contradiction_resolutions
    WHERE id = ?
  `);
  const markResolutionRolledBackStmt = db.prepare(`
    UPDATE contradiction_resolutions
    SET rolled_back_at = CURRENT_TIMESTAMP
    WHERE id = ? AND rolled_back_at IS NULL
  `);
  const reactivateFactByIdStmt = db.prepare(`
    UPDATE facts
    SET valid_to = NULL
    WHERE id = ? AND valid_to IS NOT NULL
  `);
  const insertCompactionEventStmt = db.prepare(`
    INSERT INTO compaction_events (
      id,
      input_fact_count,
      output_line_count,
      output_char_count,
      token_budget,
      before_token_estimate,
      after_token_estimate,
      compression_ratio,
      avg_quality_score,
      prioritize_contradictions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getRecentCompactionEventsStmt = db.prepare(`
    SELECT *
    FROM compaction_events
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const insertGovernanceRunStmt = db.prepare(`
    INSERT INTO governance_runs (
      id, idempotency_key, status, input_payload, started_at
    ) VALUES (?, ?, 'running', ?, CURRENT_TIMESTAMP)
  `);
  const getGovernanceRunByIdempotencyStmt = db.prepare(`
    SELECT *
    FROM governance_runs
    WHERE idempotency_key = ?
  `);
  const getGovernanceRunByIdStmt = db.prepare(`
    SELECT *
    FROM governance_runs
    WHERE id = ?
  `);
  const markGovernanceRunRunningStmt = db.prepare(`
    UPDATE governance_runs
    SET status = 'running',
        input_payload = ?,
        error_message = NULL,
        started_at = CURRENT_TIMESTAMP,
        completed_at = NULL
    WHERE id = ?
  `);
  const markGovernanceRunCompletedStmt = db.prepare(`
    UPDATE governance_runs
    SET status = 'completed',
        output_payload = ?,
        error_message = NULL,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const markGovernanceRunFailedStmt = db.prepare(`
    UPDATE governance_runs
    SET status = 'failed',
        error_message = ?,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const predicatePolicyMap = new Map();
  for (const predicate of DEFAULT_SINGLE_VALUE_PREDICATES) {
    predicatePolicyMap.set(predicate, 'single');
  }
  for (const row of getPredicatePoliciesStmt.all()) {
    predicatePolicyMap.set(String(row.predicate).toLowerCase(), row.mode);
  }

  function computeCompactionRecommendation(inputArgs = {}) {
    const staleDays = normalizeLimit(inputArgs.stale_days, 180);
    const contradictionThreshold = normalizeLimit(inputArgs.contradiction_threshold, 1);
    const tokenThreshold = normalizeLimit(inputArgs.token_threshold, DEFAULT_LIMITS.compactRecommendation);
    const currentContextTokens = inputArgs.current_context_tokens ? normalizeLimit(inputArgs.current_context_tokens, 0) : null;

    const validity = countFactsByValidityStmt.get();
    const activeRows = getActiveFactsForContradictionsStmt.all();
    const contradictions = detectContradictionsInFacts(activeRows, predicatePolicyMap);
    const staleThreshold = Date.now() - staleDays * 24 * 60 * 60 * 1000;
    const staleFacts = activeRows.filter((fact) => {
      const ts = fact.valid_from ? new Date(fact.valid_from).getTime() : Date.now();
      return ts < staleThreshold;
    });

    const reasons = [];
    if (currentContextTokens !== null && currentContextTokens >= tokenThreshold) {
      reasons.push(`context_tokens_ge_${tokenThreshold}`);
    }
    if (contradictions.length >= contradictionThreshold) {
      reasons.push(`contradictions_ge_${contradictionThreshold}`);
    }
    if (staleFacts.length > 0 && contradictions.length > 0) {
      reasons.push('stale_plus_contradictions');
    }

    return {
      recommend_compaction: reasons.length > 0,
      reasons,
      metrics: {
        active_facts: validity?.active_count || 0,
        invalidated_facts: validity?.invalidated_count || 0,
        contradiction_groups: contradictions.length,
        stale_active_facts: staleFacts.length,
        current_context_tokens: currentContextTokens,
        token_threshold: tokenThreshold
      }
    };
  }

  function executeCompactionPipeline(inputArgs = {}, options = {}) {
    const {
      force = false,
      requireRecommendation = true,
      recordTelemetry = true
    } = options;

    const recommendation = computeCompactionRecommendation(inputArgs);
    if (!force && requireRecommendation && !recommendation.recommend_compaction) {
      return {
        success: true,
        compacted: false,
        reason: 'recommendation_false',
        recommendation
      };
    }

    const tuning = deriveCompactionTuning(getRecentCompactionEventsStmt.all(DEFAULT_LIMITS.autoTuneWindow));
    const tokenBudget = inputArgs.token_budget ? normalizeLimit(inputArgs.token_budget, tuning.token_budget) : tuning.token_budget;
    const packLimit = normalizeLimit(inputArgs.limit, DEFAULT_LIMITS.contextPack);
    const perSubjectLimit = Math.min(normalizeLimit(inputArgs.per_subject_limit, tuning.per_subject_limit), 20);
    const subject = normalizeOptionalString(inputArgs.subject, 'subject');
    const sinceValidFrom = normalizeOptionalString(inputArgs.since_valid_from, 'since_valid_from', 64);
    const cursor = parseCompactionCursor(inputArgs.cursor, sinceValidFrom);
    const prioritizeContradictions = inputArgs.prioritize_contradictions === undefined ? true : Boolean(inputArgs.prioritize_contradictions);

    let rows = [];
    if (inputArgs.query) {
      if (cursor) {
        throw new Error('cursor pagination is not supported when query is provided');
      }
      const built = buildFtsSearchQuery(inputArgs.query, inputArgs.context_tags, packLimit);
      if (!built) {
        throw new Error('query is invalid');
      }
      rows = db.prepare(built.sql).all(...built.params);
    } else {
      const params = [];
      let sql = `
        SELECT id, subject, predicate, object, context_tags, source, valid_from, 0.0 as bm25_score
        FROM facts
        WHERE valid_to IS NULL
      `;
      if (subject) {
        sql += ' AND subject = ?';
        params.push(subject);
      }
      if (cursor) {
        if (cursor.mode === 'since') {
          sql += ' AND valid_from >= ?';
          params.push(cursor.valid_from);
        } else {
          sql += ' AND (valid_from < ? OR (valid_from = ? AND id < ?))';
          params.push(cursor.valid_from, cursor.valid_from, cursor.id);
        }
      }
      if (inputArgs.context_tags) {
        const tags = normalizeContextTags(inputArgs.context_tags)?.split(',') || [];
        if (tags.length > 0) {
          sql += ` AND (${tags.map(() => 'context_tags LIKE ?').join(' AND ')})`;
          params.push(...tags.map((tag) => `%${tag}%`));
        }
      }
      sql += ' ORDER BY valid_from DESC LIMIT ?';
      params.push(packLimit);
      rows = db.prepare(sql).all(...params);
    }

    const contradictionKeys = new Set();
    if (prioritizeContradictions) {
      const groups = detectContradictionsInFacts(rows, predicatePolicyMap);
      for (const group of groups) {
        contradictionKeys.add(`${String(group.subject).toLowerCase()}|${String(group.predicate).toLowerCase()}`);
      }
    }
    const scoredRows = enrichFactsWithQuality(rows)
      .map((row) => {
        const key = `${String(row.subject).toLowerCase()}|${String(row.predicate).toLowerCase()}`;
        const contradictionBoost = prioritizeContradictions && contradictionKeys.has(key) ? 0.15 : 0;
        return {
          ...row,
          contradiction_boost: contradictionBoost,
          effective_score: Number(Math.min(1, row.quality_score + contradictionBoost).toFixed(4))
        };
      })
      .sort((a, b) => b.effective_score - a.effective_score);

    const beforeText = buildContextPack(scoredRows, perSubjectLimit).text;
    const beforeTokens = estimateTokens(beforeText);
    const pack = buildTokenAwareContextPack(scoredRows, perSubjectLimit, tokenBudget);
    const avgQuality = summarizePackQuality(scoredRows, pack.selected_subjects);
    const ratio = beforeTokens > 0 ? Number((pack.used_token_estimate / beforeTokens).toFixed(4)) : 1;

    if (recordTelemetry) {
      insertCompactionEventStmt.run(
        generateUUID(),
        scoredRows.length,
        pack.lines,
        pack.text.length,
        tokenBudget,
        beforeTokens,
        pack.used_token_estimate,
        ratio,
        avgQuality,
        prioritizeContradictions ? 1 : 0
      );
    }

    return {
      success: true,
      compacted: true,
      recommendation,
      input_count: scoredRows.length,
      per_subject_limit: perSubjectLimit,
      since_valid_from: sinceValidFrom,
      cursor_used: cursor,
      prioritize_contradictions: prioritizeContradictions,
      ...pack,
      avg_quality_score: avgQuality,
      compression_ratio: ratio,
      next_cursor: scoredRows.length > 0
        ? { valid_from: scoredRows[scoredRows.length - 1].valid_from, id: scoredRows[scoredRows.length - 1].id }
        : null,
      facts: scoredRows
    };
  }

  function storeFactWithPolicy(rawFact, defaultPolicy = false) {
    const subject = validateString(rawFact.subject, 'subject');
    const predicate = validateString(rawFact.predicate, 'predicate');
    const object = validateString(rawFact.object, 'object');
    const contextTags = normalizeContextTags(rawFact.context_tags);
    const source = normalizeOptionalString(rawFact.source, 'source');
    const inferredPolicy = defaultPolicy || isSingleValuePredicate(predicate, predicatePolicyMap);
    const replaceExisting = rawFact.replace_existing === undefined ? inferredPolicy : Boolean(rawFact.replace_existing);

    const existing = findActiveExactStmt.get(subject, predicate, object);
    if (existing) {
      return { id: existing.id, deduplicated: true, inserted: false, invalidated: 0 };
    }

    let invalidated = 0;
    if (replaceExisting) {
      const invalidateResult = invalidatePredicateStmt.run(subject, predicate);
      invalidated = invalidateResult.changes;
    }

    const id = generateUUID();
    insertFactStmt.run(id, subject, predicate, object, contextTags, source);
    return { id, deduplicated: false, inserted: true, invalidated };
  }

  function extractTriples(text) {
    const triples = [];
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);

    const patterns = [
      // "X is Y" patterns (including variations like "was", "are", "were")
      {
        regex: /\b(\w[\w\s]*?)\s+(?:is|was|are|were)\s+(.+?)(?:\s+(?:and|but|or|so|because|if|when|in|at|on|with|for|from|to|about|of|as|than|that|which|who|what|where|how|why)\s+|$)/i,
        predicate: 'is'
      },
      // "X has Y" patterns
      {
        regex: /\b(\w[\w\s]*?)\s+(?:has|have|had)\s+(.+?)(?:\s+(?:and|but|or|so|because|if|when|in|at|on|with|for|from|to|about|of|as|than|that|which|who|what|where|how|why)\s+|$)/i,
        predicate: 'has'
      },
      // "X prefers Y" patterns
      {
        regex: /\b(\w[\w\s]*?)\s+(?:prefers?|liked?|loves?|enjoys?)\s+(.+?)(?:\s+(?:and|but|or|so|because|if|when|in|at|on|with|for|from|to|about|of|as|than|that|which|who|what|where|how|why)\s+|$)/i,
        predicate: 'prefers'
      },
      // "X uses Y" patterns
      {
        regex: /\b(\w[\w\s]*?)\s+(?:uses?|utilizes?|employs?)\s+(.+?)(?:\s+(?:and|but|or|so|because|if|when|in|at|on|with|for|from|to|about|of|as|than|that|which|who|what|where|how|why)\s+|$)/i,
        predicate: 'uses'
      },
      // "X works at/for Y" patterns
      {
        regex: /\b(\w[\w\s]*?)\s+(?:works?|worked)\s+(?:at|for|with)\s+(.+?)(?:\s+(?:and|but|or|so|because|if|when|in|at|on|with|for|from|to|about|of|as|than|that|which|who|what|where|how|why)\s+|$)/i,
        predicate: 'works_at'
      },
      // "X wants Y" patterns
      {
        regex: /\b(\w[\w\s]*?)\s+(?:wants?|needs?|requires?)\s+(.+?)(?:\s+(?:and|but|or|so|because|if|when|in|at|on|with|for|from|to|about|of|as|than|that|which|who|what|where|how|why)\s+|$)/i,
        predicate: 'wants'
      },
      // "X knows Y" patterns
      {
        regex: /\b(\w[\w\s]*?)\s+(?:knows?|knew|understands?)\s+(.+?)(?:\s+(?:and|but|or|so|because|if|when|in|at|on|with|for|from|to|about|of|as|than|that|which|who|what|where|how|why)\s+|$)/i,
        predicate: 'knows'
      },
      // "X lives in Y" patterns
      {
        regex: /\b(\w[\w\s]*?)\s+(?:lives?|lived|resides?)\s+(?:in|at|on)\s+(.+?)(?:\s+(?:and|but|or|so|because|if|when|in|at|on|with|for|from|to|about|of|as|than|that|which|who|what|where|how|why)\s+|$)/i,
        predicate: 'lives_in'
      }
    ];

    for (const sentence of sentences) {
      for (const pattern of patterns) {
        const match = sentence.match(pattern.regex);
        if (match) {
          let subject = match[1].trim();
          let object = match[2].trim();

          // Clean up subject (remove leading "the", "a", "an" if present)
          subject = subject.replace(/^(?:the|a|an)\s+/i, '').trim();
          object = object.replace(/^(?:the|a|an)\s+/i, '').trim();

          // Validate triple quality
          if (subject.length >= 2 && object.length >= 2 && subject.length <= 100 && object.length <= 200) {
            // Check for pronoun resolution context (simple heuristic)
            if (/^(he|she|it|they|we|this|that|these|those)$/i.test(subject)) {
              // Try to find the last proper noun in previous sentences
              for (let i = sentences.indexOf(sentence) - 1; i >= 0; i--) {
                const prevSentence = sentences[i];
                const properNounMatch = prevSentence.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
                if (properNounMatch) {
                  subject = properNounMatch[1];
                  break;
                }
              }
            }

            // Check if this triple is not a duplicate
            const isDuplicate = triples.some(t =>
              t.subject.toLowerCase() === subject.toLowerCase() &&
              t.predicate === pattern.predicate &&
              t.object.toLowerCase() === object.toLowerCase()
            );

            if (!isDuplicate) {
              triples.push({
                subject: subject,
                predicate: pattern.predicate,
                object: object
              });
            }
          }
          break; // Only extract one pattern per sentence
        }
      }
    }

    return triples;
  }

  server.setRequestHandler('tools/call', async ({ name, arguments: args }) => {
    try {
    if (name === 'memorix_store_fact') {
      const result = storeFactWithPolicy(args);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, ...result })
        }]
      };
    }

    if (name === 'memorix_store_facts') {
      if (!Array.isArray(args.facts) || args.facts.length === 0) {
        throw new Error('facts must be a non-empty array');
      }
      const insertMany = db.transaction((facts) => {
        const summary = {
          count: facts.length,
          inserted: 0,
          deduplicated: 0,
          invalidated: 0
        };

        for (const fact of facts) {
          const result = storeFactWithPolicy(fact, Boolean(args.replace_existing));
          summary.inserted += result.inserted ? 1 : 0;
          summary.deduplicated += result.deduplicated ? 1 : 0;
          summary.invalidated += result.invalidated;
        }
        return summary;
      });
      
      const summary = insertMany(args.facts);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, ...summary })
        }]
      };
    }

    if (name === 'memorix_search_fts') {
      const built = buildFtsSearchQuery(args.query, args.context_tags, args.limit);
      if (!built) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ isError: true, error: 'Query is required and must be a valid string' })
          }]
        };
      }
      try {
        const stmt = db.prepare(built.sql);
        const results = enrichFactsWithQuality(stmt.all(...built.params));
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results)
          }]
        };
      } catch (ftsError) {
        console.error('[Memorix FTS5 Error]', ftsError.message);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ isError: true, error: 'Search failed. Invalid query syntax.' })
          }]
        };
      }
    }

    if (name === 'memorix_invalidate_fact') {
      const id = validateString(args.id, 'id', 100);
      const stmt = db.prepare(`
        UPDATE facts
        SET valid_to = CURRENT_TIMESTAMP
        WHERE id = ? AND valid_to IS NULL
      `);
      const result = stmt.run(id);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: result.changes > 0, invalidated: result.changes > 0 })
        }]
      };
    }

    if (name === 'memorix_query_history') {
      const validTo = validateString(args.valid_to, 'valid_to', 64);
      const limit = normalizeLimit(args.limit, DEFAULT_LIMITS.history);
      let sql = `
        SELECT id, subject, predicate, object, context_tags, source, valid_from, valid_to
        FROM facts
        WHERE valid_from <= ?
        AND (valid_to IS NULL OR valid_to > ?)
      `;
      const params = [validTo, validTo];
      
      if (args.subject) {
        sql += ' AND subject = ?';
        params.push(validateString(args.subject, 'subject'));
      }
      
      sql += ` ORDER BY valid_from DESC LIMIT ?`;
      params.push(limit);
      
      const stmt = db.prepare(sql);
      const results = enrichFactsWithQuality(stmt.all(...params));
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results)
        }]
      };
    }

    if (name === 'memorix_trace_relations') {
      const startSubject = validateString(args.start_subject, 'start_subject');
      const maxHops = Math.min(normalizeLimit(args.max_hops, 3), 3);
      const limit = normalizeLimit(args.limit, DEFAULT_LIMITS.trace);
      
      const sql = `
        WITH RECURSIVE relation_chain AS (
          SELECT subject, predicate, object, 1 as hop
          FROM facts
          WHERE subject = ? AND valid_to IS NULL
          
          UNION ALL
          
          SELECT f.subject, f.predicate, f.object, rc.hop + 1
          FROM facts f
          JOIN relation_chain rc ON f.subject = rc.object
          WHERE f.valid_to IS NULL AND rc.hop < ?
        )
        SELECT subject, predicate, object, hop
        FROM relation_chain
        LIMIT ?
      `;
      
      const params = [startSubject, maxHops, limit];
      
      if (args.predicate_filter) {
        const predicateFilter = validateString(args.predicate_filter, 'predicate_filter');
        const filteredSql = sql.replace(
          'WHERE subject = ? AND valid_to IS NULL',
          'WHERE subject = ? AND predicate = ? AND valid_to IS NULL'
        ).replace(
          'JOIN relation_chain rc ON f.subject = rc.object',
          'JOIN relation_chain rc ON f.subject = rc.object AND f.predicate = ?'
        );
        const filteredParams = [startSubject, predicateFilter, predicateFilter, maxHops, limit];
        const stmt = db.prepare(filteredSql);
        const results = stmt.all(...filteredParams);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results)
          }]
        };
      }
      
      const stmt = db.prepare(sql);
      const results = stmt.all(...params);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results)
        }]
      };
    }

    if (name === 'memorix_auto_memorize') {
      const text = validateString(args.text, 'text');
      if (!text || text.length < 3) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ isError: true, error: 'Text must be at least 3 characters long' })
          }]
        };
      }

      const extractedTriples = extractTriples(text);

      if (extractedTriples.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, extracted: 0, stored: 0, triples: [], message: 'No valid triples found in the provided text' })
          }]
        };
      }

      const insertMany = db.transaction((facts) => {
        const summary = { inserted: 0, deduplicated: 0, invalidated: 0 };
        for (const fact of facts) {
          const result = storeFactWithPolicy({
            ...fact,
            context_tags: args.context_tags,
            source: args.source,
            replace_existing: Boolean(args.replace_existing)
          });
          summary.inserted += result.inserted ? 1 : 0;
          summary.deduplicated += result.deduplicated ? 1 : 0;
          summary.invalidated += result.invalidated;
        }
        return summary;
      });

      const summary = insertMany(extractedTriples);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            extracted: extractedTriples.length,
            stored: summary.inserted,
            deduplicated: summary.deduplicated,
            invalidated: summary.invalidated,
            triples: extractedTriples
          })
        }]
      };
    }

    if (name === 'memorix_get_context_pack') {
      const limit = normalizeLimit(args.limit, DEFAULT_LIMITS.contextPack);
      const perSubjectLimit = Math.min(normalizeLimit(args.per_subject_limit, 4), 20);
      const subject = normalizeOptionalString(args.subject, 'subject');
      const tokenBudget = args.token_budget ? normalizeLimit(args.token_budget, 400) : null;
      const sinceValidFrom = normalizeOptionalString(args.since_valid_from, 'since_valid_from', 64);
      const cursor = parseCompactionCursor(args.cursor, sinceValidFrom);
      const prioritizeContradictions = Boolean(args.prioritize_contradictions);

      let rows = [];
      if (args.query) {
        if (cursor) {
          throw new Error('cursor pagination is not supported when query is provided');
        }
        const built = buildFtsSearchQuery(args.query, args.context_tags, limit);
        if (!built) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ isError: true, error: 'query is invalid' })
            }]
          };
        }
        rows = db.prepare(built.sql).all(...built.params);
      } else {
        const params = [];
        let sql = `
          SELECT id, subject, predicate, object, context_tags, source, valid_from, 0.0 as bm25_score
          FROM facts
          WHERE valid_to IS NULL
        `;
        if (subject) {
          sql += ' AND subject = ?';
          params.push(subject);
        }
        if (cursor) {
          if (cursor.mode === 'since') {
            sql += ' AND valid_from >= ?';
            params.push(cursor.valid_from);
          } else {
            sql += ' AND (valid_from < ? OR (valid_from = ? AND id < ?))';
            params.push(cursor.valid_from, cursor.valid_from, cursor.id);
          }
        }
        if (args.context_tags) {
          const tags = normalizeContextTags(args.context_tags)?.split(',') || [];
          if (tags.length > 0) {
            sql += ` AND (${tags.map(() => 'context_tags LIKE ?').join(' AND ')})`;
            params.push(...tags.map((tag) => `%${tag}%`));
          }
        }
        sql += ' ORDER BY valid_from DESC LIMIT ?';
        params.push(limit);
        rows = db.prepare(sql).all(...params);
      }

      const contradictionKeys = new Set();
      if (prioritizeContradictions) {
        const groups = detectContradictionsInFacts(rows, predicatePolicyMap);
        for (const group of groups) {
          contradictionKeys.add(`${String(group.subject).toLowerCase()}|${String(group.predicate).toLowerCase()}`);
        }
      }

      const scoredRows = enrichFactsWithQuality(rows)
        .map((row) => {
          const key = `${String(row.subject).toLowerCase()}|${String(row.predicate).toLowerCase()}`;
          const contradictionBoost = prioritizeContradictions && contradictionKeys.has(key) ? 0.15 : 0;
          return {
            ...row,
            contradiction_boost: contradictionBoost,
            effective_score: Number(Math.min(1, row.quality_score + contradictionBoost).toFixed(4))
          };
        })
        .sort((a, b) => b.effective_score - a.effective_score);
      const pack = buildTokenAwareContextPack(scoredRows, perSubjectLimit, tokenBudget);
      const beforeText = buildContextPack(scoredRows, perSubjectLimit).text;
      const beforeTokens = estimateTokens(beforeText);
      const avgQuality = summarizePackQuality(scoredRows, pack.selected_subjects);
      const ratio = beforeTokens > 0 ? Number((pack.used_token_estimate / beforeTokens).toFixed(4)) : 1;
      insertCompactionEventStmt.run(
        generateUUID(),
        scoredRows.length,
        pack.lines,
        pack.text.length,
        tokenBudget,
        beforeTokens,
        pack.used_token_estimate,
        ratio,
        avgQuality,
        prioritizeContradictions ? 1 : 0
      );
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            input_count: scoredRows.length,
            per_subject_limit: perSubjectLimit,
            since_valid_from: sinceValidFrom,
            cursor_used: cursor,
            prioritize_contradictions: prioritizeContradictions,
            ...pack,
            avg_quality_score: avgQuality,
            compression_ratio: ratio,
            next_cursor: scoredRows.length > 0
              ? { valid_from: scoredRows[scoredRows.length - 1].valid_from, id: scoredRows[scoredRows.length - 1].id }
              : null,
            facts: scoredRows
          })
        }]
      };
    }

    if (name === 'memorix_import_markdown') {
      const sourcePath = normalizeOptionalString(args.source_path, 'source_path', 4096);
      const inlineText = normalizeOptionalString(args.text, 'text', 2_000_000);
      if (!sourcePath && !inlineText) {
        throw new Error('Either text or source_path is required');
      }

      const markdownText = inlineText || readFileSync(sourcePath, 'utf8');
      const structuredTriples = parseStructuredMarkdownTriples(markdownText);
      const extractedTriples = extractTriples(markdownText);
      const merged = [...structuredTriples, ...extractedTriples];
      const unique = [];
      const seen = new Set();
      for (const fact of merged) {
        const key = `${fact.subject.toLowerCase()}|${fact.predicate.toLowerCase()}|${fact.object.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(fact);
        }
      }

      const insertMany = db.transaction((facts) => {
        const summary = { imported: facts.length, inserted: 0, deduplicated: 0, invalidated: 0 };
        for (const fact of facts) {
          const result = storeFactWithPolicy({
            ...fact,
            context_tags: args.context_tags,
            source: args.source || sourcePath || 'markdown_import',
            replace_existing: args.replace_existing
          });
          summary.inserted += result.inserted ? 1 : 0;
          summary.deduplicated += result.deduplicated ? 1 : 0;
          summary.invalidated += result.invalidated;
        }
        return summary;
      });

      const summary = insertMany(unique);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, ...summary })
        }]
      };
    }

    if (name === 'memorix_export_markdown') {
      const limit = normalizeLimit(args.limit, 100);
      const mode = (normalizeOptionalString(args.mode, 'mode', 20) || 'memory').toLowerCase();
      if (!['memory', 'daily'].includes(mode)) {
        throw new Error('mode must be one of: memory, daily');
      }

      const subject = normalizeOptionalString(args.subject, 'subject');
      const params = [];
      let sql = `
        SELECT id, subject, predicate, object, context_tags, source, valid_from
        FROM facts
        WHERE valid_to IS NULL
      `;
      if (subject) {
        sql += ' AND subject = ?';
        params.push(subject);
      }
      if (args.context_tags) {
        const tags = normalizeContextTags(args.context_tags)?.split(',') || [];
        if (tags.length > 0) {
          sql += ` AND (${tags.map(() => 'context_tags LIKE ?').join(' AND ')})`;
          params.push(...tags.map((tag) => `%${tag}%`));
        }
      }
      sql += ' ORDER BY valid_from DESC LIMIT ?';
      params.push(limit);
      const rows = enrichFactsWithQuality(db.prepare(sql).all(...params));

      let markdown = '';
      if (mode === 'memory') {
        markdown = buildContextPack(rows, 6).text;
      } else {
        markdown = rows
          .map((row) => `- ${row.valid_from || ''} | ${row.subject} | ${row.predicate}=${row.object}`)
          .join('\n');
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            mode,
            count: rows.length,
            markdown,
            facts: rows
          })
        }]
      };
    }

    if (name === 'memorix_get_predicate_policies') {
      const predicate = normalizeOptionalString(args.predicate, 'predicate');
      if (predicate) {
        const normalized = predicate.toLowerCase();
        const row = getPredicatePolicyStmt.get(normalized);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              predicate: normalized,
              mode: row?.mode || (DEFAULT_SINGLE_VALUE_PREDICATES.has(normalized) ? 'single' : 'multi'),
              source: row ? 'db' : (DEFAULT_SINGLE_VALUE_PREDICATES.has(normalized) ? 'default' : 'implicit')
            })
          }]
        };
      }

      const rows = getPredicatePoliciesStmt.all();
      const defaults = [...DEFAULT_SINGLE_VALUE_PREDICATES]
        .filter((name) => !predicatePolicyMap.has(name) || predicatePolicyMap.get(name) === 'single')
        .map((name) => ({ predicate: name, mode: 'single', source: 'default' }));
      const combined = new Map();
      for (const row of defaults) {
        combined.set(row.predicate, row);
      }
      for (const row of rows) {
        combined.set(String(row.predicate).toLowerCase(), { predicate: String(row.predicate).toLowerCase(), mode: row.mode, source: 'db', updated_at: row.updated_at });
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, count: combined.size, policies: [...combined.values()].sort((a, b) => a.predicate.localeCompare(b.predicate)) })
        }]
      };
    }

    if (name === 'memorix_set_predicate_policy') {
      const predicate = validateString(args.predicate, 'predicate').toLowerCase();
      const mode = validateString(args.mode, 'mode', 16).toLowerCase();
      if (!['single', 'multi'].includes(mode)) {
        throw new Error('mode must be one of: single, multi');
      }
      upsertPredicatePolicyStmt.run(predicate, mode);
      predicatePolicyMap.set(predicate, mode);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, predicate, mode })
        }]
      };
    }

    if (name === 'memorix_detect_contradictions') {
      const limit = normalizeLimit(args.limit, 100);
      const subject = normalizeOptionalString(args.subject, 'subject');
      const predicate = normalizeOptionalString(args.predicate, 'predicate')?.toLowerCase();
      let rows = getActiveFactsForContradictionsStmt.all();
      if (subject) {
        rows = rows.filter((row) => row.subject === subject);
      }
      if (predicate) {
        rows = rows.filter((row) => String(row.predicate).toLowerCase() === predicate);
      }
      const contradictions = detectContradictionsInFacts(rows, predicatePolicyMap).slice(0, limit);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, count: contradictions.length, contradictions })
        }]
      };
    }

    if (name === 'memorix_resolve_contradiction') {
      const subject = validateString(args.subject, 'subject');
      const predicate = validateString(args.predicate, 'predicate').toLowerCase();
      const keepObject = normalizeOptionalString(args.keep_object, 'keep_object');
      const keepLatest = args.keep_latest === undefined ? true : Boolean(args.keep_latest);
      const facts = getActiveFactsBySubjectPredicateStmt.all(subject, predicate);
      if (facts.length <= 1) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, resolved: false, message: 'No active contradiction for the given subject+predicate' })
          }]
        };
      }

      let keepId = null;
      let strategyUsed = 'latest';
      if (keepObject) {
        const match = facts.find((fact) => String(fact.object).trim() === keepObject);
        if (!match) {
          throw new Error('keep_object not found among active facts');
        }
        keepId = match.id;
        strategyUsed = 'object_match';
      } else if (keepLatest) {
        keepId = facts[0].id;
        strategyUsed = 'latest';
      } else {
        keepId = facts[facts.length - 1].id;
        strategyUsed = 'oldest';
      }

      const resolutionId = generateUUID();
      const invalidatedIds = [];
      const txn = db.transaction(() => {
        let invalidated = 0;
        for (const fact of facts) {
          if (fact.id === keepId) {
            continue;
          }
          const changed = invalidateFactByIdStmt.run(fact.id).changes;
          if (changed > 0) {
            invalidatedIds.push(fact.id);
          }
          invalidated += changed;
        }
        insertContradictionResolutionStmt.run(
          resolutionId,
          subject,
          predicate,
          strategyUsed,
          keepId,
          JSON.stringify(invalidatedIds),
          `Resolved ${facts.length} active facts; kept ${keepId}`
        );
        return invalidated;
      });

      const invalidated = txn();
      const keptFact = facts.find((fact) => fact.id === keepId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            resolved: true,
            resolution_id: resolutionId,
            kept_fact_id: keepId,
            invalidated,
            explanation: {
              strategy: strategyUsed,
              kept_object: keptFact?.object || null,
              candidates: facts.map((fact) => ({ id: fact.id, object: fact.object, valid_from: fact.valid_from }))
            }
          })
        }]
      };
    }

    if (name === 'memorix_rollback_resolution') {
      const resolutionId = validateString(args.resolution_id, 'resolution_id');
      const row = getResolutionByIdStmt.get(resolutionId);
      if (!row) {
        throw new Error('resolution_id not found');
      }
      if (row.rolled_back_at) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, rolled_back: false, message: 'Resolution already rolled back' })
          }]
        };
      }

      let invalidatedFactIds = [];
      try {
        invalidatedFactIds = JSON.parse(row.invalidated_fact_ids || '[]');
      } catch {
        invalidatedFactIds = [];
      }
      const txn = db.transaction(() => {
        let reactivated = 0;
        for (const id of invalidatedFactIds) {
          reactivated += reactivateFactByIdStmt.run(id).changes;
        }
        markResolutionRolledBackStmt.run(resolutionId);
        return reactivated;
      });

      const reactivated = txn();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            rolled_back: true,
            resolution_id: resolutionId,
            reactivated
          })
        }]
      };
    }

    if (name === 'memorix_rank_promotion_candidates') {
      const sinceDays = normalizeLimit(args.since_days, 30);
      const minOccurrences = normalizeLimit(args.min_occurrences, 1);
      const limit = normalizeLimit(args.limit, 50);
      const rows = rankPromotionCandidatesStmt.all(`-${sinceDays} days`, minOccurrences, limit);
      const candidates = rows.map((row) => {
        const lastSeen = row.last_seen ? new Date(row.last_seen).getTime() : Date.now();
        const lastSeenDays = Math.max(0, (Date.now() - lastSeen) / (1000 * 60 * 60 * 24));
        return {
          ...row,
          last_seen_days: Number(lastSeenDays.toFixed(2)),
          promotion_score: scorePromotionCandidate({
            occurrences: row.occurrences,
            last_seen_days: lastSeenDays,
            avg_quality_score: row.avg_quality_score
          })
        };
      }).sort((a, b) => b.promotion_score - a.promotion_score);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            since_days: sinceDays,
            min_occurrences: minOccurrences,
            count: candidates.length,
            candidates
          })
        }]
      };
    }

    if (name === 'memorix_get_health_report') {
      const staleDays = normalizeLimit(args.stale_days, 180);
      const validity = countFactsByValidityStmt.get();
      const activeRows = getActiveFactsForContradictionsStmt.all();
      const contradictions = detectContradictionsInFacts(activeRows, predicatePolicyMap);
      const staleThreshold = Date.now() - staleDays * 24 * 60 * 60 * 1000;
      const staleFacts = activeRows.filter((fact) => {
        const ts = fact.valid_from ? new Date(fact.valid_from).getTime() : Date.now();
        return ts < staleThreshold;
      });
      const contradictionByPredicate = new Map();
      for (const item of contradictions) {
        const key = String(item.predicate).toLowerCase();
        contradictionByPredicate.set(key, (contradictionByPredicate.get(key) || 0) + 1);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            stale_days: staleDays,
            active_facts: validity?.active_count || 0,
            invalidated_facts: validity?.invalidated_count || 0,
            active_subjects: countDistinctSubjectsStmt.get()?.count || 0,
            active_predicates: countDistinctPredicatesStmt.get()?.count || 0,
            contradiction_groups: contradictions.length,
            contradiction_groups_by_predicate: [...contradictionByPredicate.entries()].map(([predicate, count]) => ({ predicate, count })),
            stale_active_facts: staleFacts.length
          })
        }]
      };
    }

    if (name === 'memorix_run_maintenance_sweep') {
      const dryRun = args.dry_run === undefined ? true : Boolean(args.dry_run);
      const limit = normalizeLimit(args.limit, DEFAULT_LIMITS.maintenance);
      const subject = normalizeOptionalString(args.subject, 'subject');
      const predicate = normalizeOptionalString(args.predicate, 'predicate')?.toLowerCase();

      let activeRows = getActiveFactsForContradictionsStmt.all();
      if (subject) {
        activeRows = activeRows.filter((row) => row.subject === subject);
      }
      if (predicate) {
        activeRows = activeRows.filter((row) => String(row.predicate).toLowerCase() === predicate);
      }
      const groups = detectContradictionsInFacts(activeRows, predicatePolicyMap).slice(0, limit);
      const groupFactCount = groups.reduce((sum, group) => sum + Number(group.fact_count || 0), 0);
      const groupQualityRows = groups.flatMap((group) => group.facts || []);
      const avgQualityScore = groupQualityRows.length > 0
        ? summarizePackQuality(
            groupQualityRows.map((row) => ({ ...row, effective_score: scoreActiveFact(row) })),
            groupQualityRows.map((row) => row.subject)
          )
        : 0;
      const strategy = chooseMaintenanceStrategy({
        contradiction_groups: groups.length,
        stale_active_facts: 0,
        avg_quality_score: avgQualityScore,
        group_fact_count: groupFactCount
      });
      const actions = [];
      for (const group of groups) {
        const keepFact = selectKeepFactForResolution(group.facts, strategy, null);
        if (!keepFact) {
          continue;
        }
        actions.push({
          subject: group.subject,
          predicate: group.predicate,
          keep_fact_id: keepFact.id,
          invalidate_fact_ids: group.facts.filter((fact) => fact.id !== keepFact.id).map((fact) => fact.id)
        });
      }

      if (dryRun) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
            success: true,
            dry_run: true,
            strategy,
              groups_analyzed: groups.length,
              planned_actions: actions.length,
              actions
            })
          }]
        };
      }

      const apply = db.transaction((items) => {
        let invalidated = 0;
        for (const item of items) {
          for (const id of item.invalidate_fact_ids) {
            invalidated += invalidateFactByIdStmt.run(id).changes;
          }
        }
        return invalidated;
      });

      const invalidated = apply(actions);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            dry_run: false,
            strategy,
            groups_analyzed: groups.length,
            actions_applied: actions.length,
            invalidated
          })
        }]
      };
    }

    if (name === 'memorix_recommend_compaction') {
      const recommendation = computeCompactionRecommendation(args);
      const tuning = deriveCompactionTuning(getRecentCompactionEventsStmt.all(DEFAULT_LIMITS.autoTuneWindow));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            ...recommendation,
            suggested_context_pack_args: {
              limit: DEFAULT_LIMITS.contextPack,
              per_subject_limit: tuning.per_subject_limit,
              token_budget: tuning.token_budget,
              prioritize_contradictions: true
            }
          })
        }]
      };
    }

    if (name === 'memorix_compact_context_now') {
      const result = executeCompactionPipeline(args, {
        force: Boolean(args.force),
        requireRecommendation: true,
        recordTelemetry: true
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result)
        }]
      };
    }

    if (name === 'memorix_autotune_compaction_params') {
      const window = normalizeLimit(args.window, DEFAULT_LIMITS.autoTuneWindow);
      const recent = getRecentCompactionEventsStmt.all(window);
      const tuning = deriveCompactionTuning(recent);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            window,
            ...tuning
          })
        }]
      };
    }

    if (name === 'memorix_run_governance_cycle') {
      const dryRun = args.dry_run === undefined ? true : Boolean(args.dry_run);
      const runMaintenance = args.run_maintenance === undefined ? true : Boolean(args.run_maintenance);
      const idempotencyKey = normalizeIdempotencyKey(args.idempotency_key);
      const resumeFailed = Boolean(args.resume_failed);

      let runRecord = null;
      let runId = null;
      if (idempotencyKey) {
        runRecord = getGovernanceRunByIdempotencyStmt.get(idempotencyKey);
        if (runRecord && runRecord.status === 'completed') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ...safeJsonParse(runRecord.output_payload, { success: true }),
                reused: true,
                governance_run_id: runRecord.id,
                idempotency_key: idempotencyKey
              })
            }]
          };
        }
        if (runRecord && runRecord.status === 'running') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                running: true,
                governance_run_id: runRecord.id,
                idempotency_key: idempotencyKey
              })
            }]
          };
        }
        if (runRecord && runRecord.status === 'failed' && !resumeFailed) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                retriable: true,
                message: 'Previous failed run exists for this idempotency_key. Set resume_failed=true to rerun.',
                governance_run_id: runRecord.id,
                idempotency_key: idempotencyKey
              })
            }]
          };
        }

        const inputPayload = JSON.stringify(args || {});
        if (!runRecord) {
          runId = generateUUID();
          insertGovernanceRunStmt.run(runId, idempotencyKey, inputPayload);
        } else {
          runId = runRecord.id;
          markGovernanceRunRunningStmt.run(inputPayload, runId);
        }
      }

      try {
        const compaction = executeCompactionPipeline(args, {
          force: Boolean(args.force_compaction),
          requireRecommendation: true,
          recordTelemetry: !dryRun
        });
        const maintenanceStrategy = chooseMaintenanceStrategy({
          contradiction_groups: Number(compaction?.recommendation?.metrics?.contradiction_groups || 0),
          stale_active_facts: Number(compaction?.recommendation?.metrics?.stale_active_facts || 0),
          avg_quality_score: Number(compaction?.avg_quality_score || 0)
        });

        let maintenance = null;
        if (runMaintenance) {
          const limit = normalizeLimit(args.limit, DEFAULT_LIMITS.maintenance);
          const subject = normalizeOptionalString(args.subject, 'subject');
          const predicate = normalizeOptionalString(args.predicate, 'predicate')?.toLowerCase();

          let activeRows = getActiveFactsForContradictionsStmt.all();
          if (subject) {
            activeRows = activeRows.filter((row) => row.subject === subject);
          }
          if (predicate) {
            activeRows = activeRows.filter((row) => String(row.predicate).toLowerCase() === predicate);
          }
          const groups = detectContradictionsInFacts(activeRows, predicatePolicyMap).slice(0, limit);
          const actions = [];
          for (const group of groups) {
            const keepFact = selectKeepFactForResolution(group.facts, maintenanceStrategy, null);
            if (!keepFact) {
              continue;
            }
            actions.push({
              subject: group.subject,
              predicate: group.predicate,
              keep_fact_id: keepFact.id,
              invalidate_fact_ids: group.facts.filter((fact) => fact.id !== keepFact.id).map((fact) => fact.id)
            });
          }

          if (dryRun) {
            maintenance = {
              dry_run: true,
              strategy: maintenanceStrategy,
              groups_analyzed: groups.length,
              planned_actions: actions.length,
              actions
            };
          } else {
            const apply = db.transaction((items) => {
              let invalidated = 0;
              for (const item of items) {
                for (const id of item.invalidate_fact_ids) {
                  invalidated += invalidateFactByIdStmt.run(id).changes;
                }
              }
              return invalidated;
            });
            const invalidated = apply(actions);
            maintenance = {
              dry_run: false,
              strategy: maintenanceStrategy,
              groups_analyzed: groups.length,
              actions_applied: actions.length,
              invalidated
            };
          }
        }

        const output = {
          success: true,
          dry_run: dryRun,
          compaction,
          maintenance,
          consistency: buildConsistencySummary(getActiveFactsForContradictionsStmt.all(), predicatePolicyMap),
          governance_run_id: runId,
          idempotency_key: idempotencyKey
        };

        if (runId) {
          markGovernanceRunCompletedStmt.run(JSON.stringify(output), runId);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(output)
          }]
        };
      } catch (error) {
        if (runId) {
          markGovernanceRunFailedStmt.run(String(error?.message || error), runId);
        }
        throw error;
      }
    }

    if (name === 'memorix_get_governance_run') {
      const runId = normalizeOptionalString(args.run_id, 'run_id');
      const idempotencyKey = normalizeIdempotencyKey(args.idempotency_key);
      if (!runId && !idempotencyKey) {
        throw new Error('run_id or idempotency_key is required');
      }
      const row = runId
        ? getGovernanceRunByIdStmt.get(runId)
        : getGovernanceRunByIdempotencyStmt.get(idempotencyKey);
      if (!row) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: false, found: false })
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            found: true,
            run: {
              id: row.id,
              idempotency_key: row.idempotency_key,
              status: row.status,
              started_at: row.started_at,
              completed_at: row.completed_at,
              error_message: row.error_message,
              input_payload: safeJsonParse(row.input_payload, row.input_payload),
              output_payload: safeJsonParse(row.output_payload, row.output_payload)
            }
          })
        }]
      };
    }

    if (name === 'memorix_check_consistency') {
      const subject = normalizeOptionalString(args.subject, 'subject');
      const predicate = normalizeOptionalString(args.predicate, 'predicate')?.toLowerCase();
      let activeRows = getActiveFactsForContradictionsStmt.all();
      if (subject) {
        activeRows = activeRows.filter((row) => row.subject === subject);
      }
      if (predicate) {
        activeRows = activeRows.filter((row) => String(row.predicate).toLowerCase() === predicate);
      }
      const summary = buildConsistencySummary(activeRows, predicatePolicyMap);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            subject,
            predicate,
            ...summary
          })
        }]
      };
    }

    throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      console.error('[Memorix Error]', error.message);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ isError: true, error: 'Internal server error', message: error.message })
        }]
      };
    }
  });

  return server;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport);
}

export {
  buildContextPack,
  buildFtsSearchQuery,
  buildTokenAwareContextPack,
  chooseMaintenanceStrategy,
  buildConsistencySummary,
  createServer,
  detectContradictionsInFacts,
  deriveCompactionTuning,
  estimateTokens,
  enrichFactsWithQuality,
  generateUUID,
  isSingleValuePredicate,
  normalizeIdempotencyKey,
  normalizeLimit,
  parseCompactionCursor,
  parseStructuredMarkdownTriples,
  safeJsonParse,
  sanitizeFtsQuery,
  selectKeepFactForResolution,
  scoreActiveFact,
  scorePromotionCandidate,
  summarizePackQuality,
  validateString
};
