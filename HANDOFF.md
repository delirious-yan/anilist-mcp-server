# AniList MCP server — public developer handoff

This public repository implements an AniList GraphQL MCP server. Code, tests, CI, open-source documentation and the generic authentication model remain public. **Owner-specific account history, private taste preferences, migration snapshots, personal scores, and detailed run reviews belong in private project notes, not this repository.**

## Development and authorization

- GitHub is the canonical engineering workspace; no local checkout is required for owner-assisted maintenance.
- Use Node.js tooling and normal PR checks for code changes.
- General reads can use AniList's public GraphQL API; authenticated list mutations require a valid token from the user whose account is affected.
- For individual approved AniList updates, first prefer the connected AniList MCP client. If unavailable, the repository's documented request-file workflow can be used with explicit authorization and authenticated before/after verification: [docs/anilist-sync-workflow.md](docs/anilist-sync-workflow.md).
- A successful previous write does not authorize future changes. Never expose credentials, personal history bundles, private preferences, or decrypted migration details in source, issue descriptions, Actions logs or artifacts.
- Legacy historical AniDB migration is **complete**. Do not rerun migration workflows without a new reviewed plan and direct owner approval.

## Conservative data-handling rules

1. Do not infer watched status from owned files.
2. Favor exact AniDB/AniList identifiers; use reviewed fallback mappings only if unambiguous.
3. Treat existing newer AniList states as authoritative absent stronger verified evidence.
4. Never translate community ratings into personal user scores.
5. Never invent watched dates or mark incomplete evidence as completed.
6. Verify every approved write through authenticated read-back.
7. No automatic private-data printing or account mutation in arbitrary CI jobs.

The owner-controlled private handoff holds any individual historical exceptions, verification metrics and unresolved personal-record decisions. Previous public Git revisions and Actions logs may still contain derived history and should not be treated as erased by this update.
