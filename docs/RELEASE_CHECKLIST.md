# Release Checklist

## Pre-release

- [ ] Confirm version in `package.json` is correct
- [ ] Update `CHANGELOG.md`
- [ ] Update `README.md` and `README_zh.md` tool tables
- [ ] Update `SKILL.md` tool reference counts and schemas
- [ ] Run migrations sanity check on local database

## Verification

- [ ] `npm run build`
- [ ] `npm run test`
- [ ] `npm run view -- --stats`
- [ ] Optional: `npm pack` and inspect tarball contents

## Packaging

- [ ] Ensure `.npmignore` excludes non-runtime artifacts
- [ ] Confirm tarball includes `dist/server.js`, `SKILL.md`, `README*`, `CHANGELOG.md`
- [ ] Confirm tarball excludes local DB files and temporary artifacts

## Publish (when enabled)

- [ ] `npm whoami` (correct account)
- [ ] Verify publish permission for package name/scope
- [ ] `npm publish --access public` (for scoped public package)

## Post-release

- [ ] Tag release in git (`vX.Y.Z`)
- [ ] Attach release notes
- [ ] Run smoke test in a clean workspace
