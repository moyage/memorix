# Memorix Publishing Checklist

This document outlines the required steps to list the Memorix MCP Server on ClawHub and other MCP marketplaces.

---

## 1. Security Verification (MANDATORY)

Before any release, these security issues MUST be resolved:

### 1.1 FTS5 Query Injection Fix
- [ ] **Location:** `src/server.js` - `memorix_search_fts` tool handler
- [ ] Add query validation (non-empty string check)
- [ ] Wrap FTS5 MATCH in try-catch to handle malformed queries
- [ ] Return user-friendly error instead of crashing server

### 1.2 Global Error Handler
- [ ] **Location:** `src/server.js` - `tools/call` handler
- [ ] Wrap all tool handlers in try-catch
- [ ] Return JSON error responses (don't crash)
- [ ] Log errors appropriately for debugging

### 1.3 Input Validation
- [ ] Add length limits to `subject`, `predicate`, `object` (max 10,000 chars)
- [ ] Validate input types (must be strings)
- [ ] Validate numeric params (`limit`, `max_hops`) - positive integers only
- [ ] Sanitize `context_tags` splitting

---

## 2. Marketplace Metadata Requirements

### 2.1 package.json Fields

| Field | Required Value | Notes |
|-------|---------------|-------|
| `version` | `2.0.0` | Must match server.js version |
| `repository.url` | `https://github.com/moyage/memorix.git` | Correct org |
| `engines` | `{"node": ">=18.0.0"}` | Node version requirement |
| `openclaw.publisher` | `moyage` | Publisher org ID |
| `openclaw.icon` | Valid URL (48x48 PNG) | Plugin icon |

### 2.2 ClawHub Specific

- [ ] Package name: `memorix`
- [ ] Display name: `Memorix - AI Long-Term Memory`
- [ ] Category: `memory`
- [ ] Entry point: `src/server.js`
- [ ] Description meets marketplace guidelines (< 500 chars)
- [ ] Icon is accessible and valid format

---

## 3. Code Quality Checklist

### 3.1 Required Checks
- [ ] No `console.log` statements in production code
- [ ] All tool descriptions are complete and accurate
- [ ] Input schemas have all required fields marked
- [ ] Error messages are user-friendly (no internal details exposed)

### 3.2 Testing Requirements
- [ ] Empty query → returns empty array (not crash)
- [ ] Malformed FTS5 query → returns error (not crash)
- [ ] Max-length strings → handled gracefully
- [ ] Negative limit values → clamped to valid range
- [ ] All 6 tools respond correctly:
  - [ ] `memorix_store_fact`
  - [ ] `memorix_store_facts`
  - [ ] `memorix_search_fts`
  - [ ] `memorix_invalidate_fact`
  - [ ] `memorix_query_history`
  - [ ] `memorix_trace_relations`

### 3.3 Dependencies
- [ ] No unnecessary dependencies added
- [ ] All dependencies have compatible licenses
- [ ] No known CVE vulnerabilities in dependency tree
- [ ] `better-sqlite3` native build works on target platforms

---

## 4. npm Publishing Steps

### 4.1 Pre-Publish
```bash
# Update version
npm version patch  # or minor/major

# Verify package.json
npm view . --json

# Test local install
npm pack
npm install ./memorix-*.tgz
```

### 4.2 Publish to npm (if applicable)
```bash
# Login to npm (one-time)
npm login

# Publish
npm publish --access public
```

### 4.3 Post-Publish
- [ ] Verify package on npmjs.com
- [ ] Test install from npm
- [ ] Verify git tag created

---

## 5. ClawHub Submission

### 5.1 Prerequisites
- [ ] GitHub repository is public
- [ ] GitHub release created with version tag
- [ ] Package published to npm (or provide tarball)

### 5.2 Submission Fields
| Field | Value |
|-------|-------|
| Package Name | `memorix` |
| Version | `2.0.0` |
| Source URL | `https://github.com/moyage/memorix` |
| npm Package | `memorix` |
| Category | `memory` |
| Author | `OpenClaw Labs Team` |
| License | `MIT` |

### 5.3 After Approval
- [ ] Verify skill installs correctly in OpenClaw
- [ ] Test all 6 tools work from OpenClaw
- [ ] Confirm database persists between sessions

---

## 6. GitHub Release

### 6.1 Release Checklist
- [ ] Create git tag: `git tag -a v2.0.0 -m "Release v2.0.0"`
- [ ] Push tag: `git push origin v2.0.0`
- [ ] Create GitHub release with:
  - Title: `Memorix v2.0.0`
  - Description: Changelog from v1.0.0
  - Binary attached (optional)

---

## 7. Post-Release Verification

- [ ] ClawHub listing appears correctly
- [ ] Skill installs via OpenClaw
- [ ] Database operations work end-to-end
- [ ] FTS5 search returns expected results
- [ ] No errors in server logs during normal use

---

## Quick Reference: Minimum Viable Release

To release v2.0.0, you MUST have:

1. ✅ FTS5 query validation (no crashes on bad input)
2. ✅ Global error handler (no unhandled exceptions)
3. ✅ `package.json` version set to `2.0.0`
4. ✅ `repository.url` = `github.com/moyage/memorix.git`
5. ✅ `engines.node` >= 18.0.0
6. ✅ All 6 tools functional and tested

Everything else (docs, badges, additional fields) can be added post-release.

---

*Last Updated: 2026-04-08*
