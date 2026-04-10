#!/usr/bin/env node
/**
 * Memorix Build Script
 * 
 * Bundles the MCP server with esbuild, treating better-sqlite3 as external
 * since it's a native module that cannot be bundled.
 */

import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENTRY_POINT = path.join(__dirname, 'src', 'server.js');
const OUTFILE = path.join(__dirname, 'dist', 'server.js');

async function build() {
  console.log('🔨 Building Memorix MCP Server...');
  
  try {
    await esbuild.build({
      entryPoints: [ENTRY_POINT],
      bundle: true,
      outfile: OUTFILE,
      format: 'esm',
      platform: 'node',
      target: 'node18',
      external: [
        'better-sqlite3',
        '@modelcontextprotocol/server',
        '@modelcontextprotocol/server/*',
        'path',
        'fs',
        'os',
        'crypto',
        'stream',
        'util',
        'events',
        'url',
        'buffer',
        'string_decoder'
      ],
      sourcemap: true,
      minify: true,
      logLevel: 'info'
    });
    
    console.log('✅ Build successful!');
    console.log(`📦 Output: ${OUTFILE}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

build();
