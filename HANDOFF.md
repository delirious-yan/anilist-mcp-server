# AniDB → AniList Migration Handoff

## Purpose

Preserve the current migration plan and verified findings so this project can be resumed later without re-discovery.

## Repository state

- Working fork: `delirious-yan/anilist-mcp-server`
- Upstream: `Grinv/anilist-mcp-server`
- Base version at fork creation: v0.9.0
- Upstream/base commit at fork creation: `431882a7ffd89038cbabb01ced0e32f931e725df`
- Fork-specific commit policy was updated in `AGENTS.md` so fork work can use the authenticated GitHub/connector identity.
- No AniList list mutations have been performed as part of this migration.

## Target AniList account

- Username: `Luciedmeo`

## AniDB source data

Two AniDB exports are required together:

1. **`json-large`**
   - Used for anime/library metadata, AniDB IDs, title data, episode totals, and historical MyList/library context.
   - Important: its apparent completion/library status must **not** be treated as proof that the anime was watched.

2. **`txt-udp-mylist`**
   - Used for per-episode MyList state and watched history.
   - Includes `viewdate`, which is the key source for historical watched-state reconstruction.

### Verified migration dataset findings

From the inspected exports:

- 208 AniDB anime entries
- 196 direct AniDB → AniList ID matches
- 12 entries need fallback/manual resolution
- `json-large` alone is insufficient for watched/completed inference
- `txt-udp-mylist` provides the watched/viewdate layer needed to avoid false completion assumptions

Additional watched-state analysis from the UDP export:

- 3,041 MyList records
- 2,866 unique episodes represented
- 2,968 files represented
- 2,756 unique episodes with a watched date
- 110 unique episodes without a watched date
- 132 anime are strong Completed candidates because the normal series appears complete and all normal episodes represented are watched
- 41 anime have every owned episode watched but the full series was not owned; preserve progress, do not infer full completion
- 1 anime was clearly partially watched: **Kanon**, 11/24 episodes watched
- 14 anime had episode/file records but zero watched episodes
- 20 anime had no episode files in the UDP export, so watched state should not be inferred from them

## Important migration rule

**Do not equate "owned all episodes" with "watched all episodes."**

Example discovered during inspection:

- A title can appear library-complete in `json-large` while having zero watched episodes in `txt-udp-mylist`.

The UDP watched/viewdate evidence is the historical source of truth for watched-state reconstruction.

## Existing MCP capabilities

The fork already exposes the core AniList functions needed for the migration workflow, including:

- `get_user_list`
- `search_media`
- `add_list_entry`
- `update_list_entry`
- `update_list_entries`
- `remove_list_entry`
- `login_anilist`

The server already talks directly to AniList GraphQL and supports authenticated list management.

## Next setup step

Create an AniList developer application.

Use:

- Redirect URL: `http://localhost:8082/callback`

Keep the **Client ID** and **Client Secret** local. Never commit either credential.

Local working path:

```text
C:\Users\Ian\Projects\anilist-mcp-server
```

Build locally:

```powershell
cd C:\Users\Ian\Projects\anilist-mcp-server
npm ci
npm run build
```

Then connect the built MCP server to an MCP client and authenticate with AniList using `login_anilist`.

Example Claude Code registration:

```powershell
claude mcp add anilist `
  -e ANILIST_CLIENT_ID=YOUR_ID `
  -e ANILIST_CLIENT_SECRET=YOUR_SECRET `
  -- node C:\Users\Ian\Projects\anilist-mcp-server\dist\index.js
```

After registration, run the AniList login flow and confirm the authenticated account is `Luciedmeo`.

## First implementation phase: dry-run only

Do **not** begin with a bulk import tool that writes directly to AniList.

Recommended structure:

```text
src/
  importers/
    anidb.ts

scripts/
  import-anidb.ts
```

The first implementation must only:

1. Parse and normalize both AniDB exports.
2. Merge the library metadata with the UDP watched/viewdate data.
3. Map AniDB IDs to AniList IDs.
4. Resolve the remaining unmatched entries through fallback matching.
5. Fetch the existing AniList list for `Luciedmeo`.
6. Compare AniDB history against current AniList state.
7. Produce a migration report.
8. Make **zero AniList writes**.

## Mapping strategy

Preferred order:

1. Exact AniDB ID → AniList ID mapping
2. Fallback by title + year + format/type
3. Manual review for ambiguous matches

Current known state:

- 196 exact ID matches
- 12 unresolved entries requiring fallback/manual handling

Do not use fuzzy title matching as the first choice when a stable ID mapping exists.

## Dry-run report categories

At minimum, produce:

- Already on AniList
- Missing from AniList
- Exact ID match
- Fallback match
- Same status/progress
- AniDB contains stronger historical progress evidence
- AniList contains newer/more recent data
- Status/progress conflict
- Ambiguous mapping
- Unresolved mapping
- Proposed change
- No-op / preserve current AniList data

## Conservative merge policy

Use the following defaults unless explicitly changed later:

- Strong fully-watched historical candidates may be proposed as `COMPLETED`
- Partial watched entries preserve episode progress
- Titles with zero watched episodes must **not** be marked `COMPLETED`
- Having all files/episodes in AniDB is not proof of completion
- Existing newer AniList information wins unless AniDB provides clearly stronger historical evidence
- Never overwrite current AniList data merely because an older AniDB record exists
- Ambiguous mappings require manual review
- Unresolved mappings must not be written
- First migration run is read-only/dry-run
- Any later write phase must require explicit approval after reviewing the dry-run output

## Dates

Where reliable `viewdate` history exists, preserve it as historical evidence for possible start/completion dates.

Do not invent dates when the export does not establish them clearly.

## Privacy and repository hygiene

- Do not commit raw personal AniDB exports to this public repository.
- Keep raw exports local/private.
- If fixtures are needed for tests, create sanitized/minimal samples only.
- Never commit AniList credentials, access tokens, or OAuth secrets.

## Implementation status

The read-only migration implementation is now staged in draft PR #1 on branch
`feat/anidb-migration-dry-run`.

Implemented:

- `src/importers/anidb.ts`: parses/normalizes both exports, reconstructs watched history, performs exact ID mapping, conservative fallback scoring, and comparison logic.
- `src/anidb-migration.ts`: local read-only CLI that accepts the two AniDB exports directly as `.tgz` archives (or extracted files), downloads the pinned ID mapping dataset, checks the current AniList list, and emits a JSON report.
- `src/__tests__/anidbImporter.test.ts`: sanitized synthetic tests; no personal AniDB data is committed.
- `npm run anidb:dry-run -- ...`: build + execute the migration preview.
- The CLI contains no AniList mutation call and reports `writesApplied: 0`.

Example after syncing the branch locally:

```powershell
npm run anidb:dry-run -- \
  --json-large C:\path\to\json-large.tgz \
  --udp C:\path\to\txt-udp-mylist.tgz \
  --user Luciedmeo \
  --output C:\path\to\anidb-anilist-dry-run.json
```

The dry-run can read the public AniList list without OAuth. Authenticating first is still preferred because it lets the comparison include any private entries and verifies that the write-capable account is actually `Luciedmeo`.

Validation status:

- Manual/static review has been performed and strict checked-index issues found during review were fixed.
- The implementation remains in a **draft PR** until a real `npm run build && npm test && npm run lint && npm run format:check` completes.
- GitHub Actions has now been enabled on the fork. A fresh branch update is being used to trigger CI; do not treat validation as passed until the workflow run completes successfully.

Still requiring user-side/local interaction:

1. Create the AniList developer app with redirect `http://localhost:8082/callback` if it does not already exist.
2. Keep Client ID/Secret local and authenticate `Luciedmeo` with `login_anilist`.
3. Run the dry-run against the two private AniDB archives and review the generated report.
4. Only after review, define/approve a separate write phase. No write phase has been implemented.

## Resume point

When continuing this project:

1. Confirm the local fork is synced with GitHub.
2. Create the AniList developer app if not already done.
3. Authenticate `Luciedmeo` with `login_anilist`.
4. Implement parser + mapper + dry-run comparison only.
5. Generate and review the comparison report.
6. Decide the final merge/write policy only after the dry-run results are visible.
