import { Server, StdioServerTransport } from '@modelcontextprotocol/server';
import { getDatabase } from './schema.js';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
        source: { type: 'string', description: 'Context or file path origin', optional: true }
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
              source: { type: 'string', optional: true }
            },
            required: ['subject', 'predicate', 'object']
          }
        }
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
        source: { type: 'string', description: 'Origin or context of the text', optional: true }
      },
      required: ['text']
    }
  };

  const server = new Server({
    name: 'memorix',
    version: '2.0.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  server.setRequestHandler('tools/list', async () => {
    return {
      tools: [storeFactTool, storeFactsTool, searchFtsTool, invalidateFactTool, queryHistoryTool, traceRelationsTool, autoMemorizeTool]
    };
  });

  const MAX_FIELD_LENGTH = 10000;
  const MAX_QUERY_LENGTH = 5000;

  function validateString(value, fieldName, maxLen = MAX_FIELD_LENGTH) {
    if (typeof value !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }
    if (value.length > maxLen) {
      throw new Error(`${fieldName} exceeds maximum length of ${maxLen}`);
    }
    return value.trim();
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
    return sanitized.trim() || null;
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
      const subject = validateString(args.subject, 'subject');
      const predicate = validateString(args.predicate, 'predicate');
      const object = validateString(args.object, 'object');
      const id = generateUUID();
      const stmt = db.prepare(`
        INSERT INTO facts (id, subject, predicate, object, context_tags, source)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, subject, predicate, object, args.context_tags || null, args.source || null);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, id })
        }]
      };
    }

    if (name === 'memorix_store_facts') {
      if (!Array.isArray(args.facts) || args.facts.length === 0) {
        throw new Error('facts must be a non-empty array');
      }
      const insertStmt = db.prepare(`
        INSERT INTO facts (id, subject, predicate, object, context_tags, source)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      const insertMany = db.transaction((facts) => {
        for (const fact of facts) {
          const subject = validateString(fact.subject, 'subject');
          const predicate = validateString(fact.predicate, 'predicate');
          const object = validateString(fact.object, 'object');
          const id = generateUUID();
          insertStmt.run(id, subject, predicate, object, fact.context_tags || null, fact.source || null);
        }
      });
      
      insertMany(args.facts);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, count: args.facts.length })
        }]
      };
    }

    if (name === 'memorix_search_fts') {
      const limit = args.limit || 10;
      const sanitizedQuery = sanitizeFtsQuery(args.query);
      if (!sanitizedQuery) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ isError: true, error: 'Query is required and must be a valid string' })
          }]
        };
      }
      let params = [sanitizedQuery, limit];
      
      let sql = `
        SELECT f.id, f.subject, f.predicate, f.object, f.context_tags, f.source, f.valid_from
        FROM facts f
        JOIN facts_fts fts ON f.rowid = fts.rowid
        WHERE facts_fts MATCH ?
        AND f.valid_to IS NULL
      `;
      
      if (args.context_tags) {
        const tags = args.context_tags.split(',').map(t => t.trim());
        const tagConditions = tags.map(() => `f.context_tags LIKE ?`).join(' AND ');
        sql += ` AND (${tagConditions})`;
        params = [sanitizedQuery, limit, ...tags.map(t => `%${t}%`)];
      }
      
      sql += ` ORDER BY rank LIMIT ?`;
      try {
        const stmt = db.prepare(sql);
        const results = stmt.all(...params);
        
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
      const stmt = db.prepare(`
        UPDATE facts
        SET valid_to = CURRENT_TIMESTAMP
        WHERE id = ? AND valid_to IS NULL
      `);
      const result = stmt.run(args.id);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: result.changes > 0, invalidated: result.changes > 0 })
        }]
      };
    }

    if (name === 'memorix_query_history') {
      const limit = args.limit || 50;
      let sql = `
        SELECT id, subject, predicate, object, context_tags, source, valid_from, valid_to
        FROM facts
        WHERE valid_from <= ?
        AND (valid_to IS NULL OR valid_to > ?)
      `;
      const params = [args.valid_to, args.valid_to];
      
      if (args.subject) {
        sql += ` AND subject = ?`;
        params.push(args.subject);
      }
      
      sql += ` ORDER BY valid_from DESC LIMIT ?`;
      params.push(limit);
      
      const stmt = db.prepare(sql);
      const results = stmt.all(...params);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results)
        }]
      };
    }

    if (name === 'memorix_trace_relations') {
      const maxHops = Math.min(args.max_hops || 3, 3);
      const limit = args.limit || 100;
      
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
      
      const params = [args.start_subject, maxHops, limit];
      
      if (args.predicate_filter) {
        const filteredSql = sql.replace(
          'WHERE subject = ? AND valid_to IS NULL',
          'WHERE subject = ? AND predicate = ? AND valid_to IS NULL'
        ).replace(
          'JOIN relation_chain rc ON f.subject = rc.object',
          'JOIN relation_chain rc ON f.subject = rc.object AND f.predicate = ?'
        );
        const filteredParams = [args.start_subject, args.predicate_filter, args.predicate_filter, maxHops, limit];
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

      const insertStmt = db.prepare(`
        INSERT INTO facts (id, subject, predicate, object, context_tags, source)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((facts) => {
        for (const fact of facts) {
          const id = generateUUID();
          insertStmt.run(id, fact.subject, fact.predicate, fact.object, args.context_tags || null, args.source || null);
        }
      });

      insertMany(extractedTriples);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            extracted: extractedTriples.length,
            stored: extractedTriples.length,
            triples: extractedTriples
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

const server = createServer();
const transport = new StdioServerTransport();
server.connect(transport);
