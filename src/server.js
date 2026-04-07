const { Server } = require('@modelcontextprotocol/server');
const { StdioServerTransport } = require('@modelcontextprotocol/server/stdio');
const { getDatabase } = require('./schema');

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
    description: 'Store a new temporal triple (fact) into memory',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'The entity being described' },
        predicate: { type: 'string', description: 'The relationship or action' },
        object: { type: 'string', description: 'The target or value' },
        source: { type: 'string', description: 'Context or file path origin', optional: true }
      },
      required: ['subject', 'predicate', 'object']
    }
  };

  const searchFtsTool = {
    name: 'memorix_search_fts',
    description: 'Search memory using FTS5 full-text search',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search string (supports FTS5 syntax)' },
        limit: { type: 'integer', description: 'Max results', default: 10 }
      },
      required: ['query']
    }
  };

  const invalidateFactTool = {
    name: 'memorix_invalidate_fact',
    description: 'Mark a fact as no longer valid without deleting history',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The UUID of the fact to invalidate' }
      },
      required: ['id']
    }
  };

  const server = new Server({
    name: 'memorix',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  server.setRequestHandler('tools/list', async () => {
    return {
      tools: [storeFactTool, searchFtsTool, invalidateFactTool]
    };
  });

  server.setRequestHandler('tools/call', async ({ name, arguments: args }) => {
    if (name === 'memorix_store_fact') {
      const id = generateUUID();
      const stmt = db.prepare(`
        INSERT INTO facts (id, subject, predicate, object, source)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(id, args.subject, args.predicate, args.object, args.source || null);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, id })
        }]
      };
    }

    if (name === 'memorix_search_fts') {
      const limit = args.limit || 10;
      const stmt = db.prepare(`
        SELECT f.id, f.subject, f.predicate, f.object, f.source, f.valid_from
        FROM facts f
        JOIN facts_fts fts ON f.rowid = fts.rowid
        WHERE facts_fts MATCH ?
        AND f.valid_to IS NULL
        ORDER BY rank
        LIMIT ?
      `);
      const results = stmt.all(args.query, limit);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results)
        }]
      };
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

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

const server = createServer();
const transport = new StdioServerTransport();
server.connect(transport);
