# AniDB → AniList Migration Handoff

## Development workflow

- **GitHub/repository is the sole source of truth.** Do not require or depend on a local checkout for project work.
- All implementation, review, validation, CI, documentation, and migration tooling changes must be performed through the repository and GitHub Actions/remote repo workflows.
- Do not instruct the user to `git pull`, run local builds/tests, or maintain a local project copy as part of the normal workflow.
- Any step that appears to require localhost-only execution must be redesigned into a repo-hosted/remote-safe flow before it is treated as a required project step.

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

The project is repo-only. Do not use a local checkout or localhost OAuth flow.

The first real migration comparison now runs through
`.github/workflows/anidb-dry-run.yml` on a GitHub-hosted runner.

Required GitHub repository secret:

- `ANIDB_HISTORY_BUNDLE_B64` — compact gzip+base64 normalized history derived from the two private AniDB exports.

The raw exports remain outside the public repository. The workflow decodes the
bundle only in the runner's temporary directory, performs a read-only comparison
against `Luciedmeo`, encrypts the detailed report, uploads only the encrypted
artifact, and deletes the plaintext temporary files.

OAuth is **not required for the first dry-run** because the current AniList list
is public. For any later approved write phase, use a browser-only AniList Auth
Pin flow and store the resulting token as the GitHub Actions secret
`ANILIST_ACCESS_TOKEN`; do not reintroduce localhost as a project dependency.

See `docs/anidb-migration.md`.

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

The read-only migration implementation is staged in draft PR #1 on branch
`feat/anidb-migration-dry-run`.

Implemented:

- `src/importers/anidb.ts`: parses raw AniDB exports, reconstructs watched history, validates normalized private history bundles, performs exact ID mapping, conservative fallback scoring, and comparison logic.
- `src/anidb-migration.ts`: read-only CLI supporting either raw exports or `--history-bundle`, then comparing against the current AniList list and emitting a JSON report.
- `src/__tests__/anidbImporter.test.ts`: sanitized synthetic tests, including normalized-history-bundle coverage.
- `.github/workflows/anidb-dry-run.yml`: repo-hosted GitHub Actions dry-run with private input from `ANIDB_HISTORY_BUNDLE_B64`, zero mutations, encrypted report artifact, and plaintext cleanup.
- `docs/anidb-migration.md`: repo-only execution/privacy model.
- No personal AniDB export, normalized bundle, plaintext report, or AniList credential is committed.

Validation status:

- GitHub Actions is enabled.
- CI run #16 passed on Node 20/22/24 after the repo-only workflow and normalized-bundle changes. Build, tests, lint, formatting, coverage, MCPB validation, production audit, and dependency-signature verification all passed.
- The repo-hosted migration workflow itself was created successfully and its first run stopped exactly at the expected secret gate because `ANIDB_HISTORY_BUNDLE_B64` has not yet been configured.
- No AniList writes have occurred.

Dry-run review status:

- Repository secret `ANIDB_HISTORY_BUNDLE_B64`: **configured**.
- Repo-hosted dry-run run `37466671602`: **successful**.
- Result: 196 exact mappings, 10 high-confidence fallbacks, 1 curated split mapping, 1 curated no-op aggregate, **0 unresolved mappings**, and **0 writes**.
- Comparison: 129 ordinary missing Completed candidates, 1 Gintama split Completed candidate (2 AniList entries), 42 partial-history entries, 32 unwatched/unknown no-write entries, and 3 already-Completed overlaps.
- Detailed review and proposed first-write policy: `docs/anidb-migration-review.md`.
- Current head CI passed on Node 20/22/24, including build, tests, lint, formatting, coverage, MCPB validation, production audit, and dependency-signature verification.

Completed-only write phase:

- User approval: **granted 2026-10-06**.
- Guarded completed-only write phase: **merged to `main` via PR #2** at commit `04cb4d11b9a22e50f9c26d8a1b9a34356ac2ab59`.
- Repo-hosted plan run `37471359927`: **successful, zero writes**.
- Final PR #2 CI run `37475944878`: **green** on Node 20/22/24; quality, formatting, coverage, MCPB validation, production audit, and dependency-signature verification all passed.
- Fingerprinted Completed target set: **132 unique AniList media targets**.
- Fingerprinted reviewed write plan: **130 missing entries**.
- Exact apply confirmation: `APPLY_COMPLETED_ONLY_130`.
- Apply preserves every existing AniList entry, writes no scores/dates, excludes all partial/unwatched/unknown history, probes each media immediately before mutation, verifies every creation, and rolls back a newly-created entry if verification fails.
- Apply is locked to authenticated AniList user `Luciedmeo` and the reviewed target/snapshot/plan fingerprints.
- The only remaining account-side prerequisites are a repo-safe AniList access token in GitHub secret `ANILIST_ACCESS_TOKEN` and an explicit activity-feed choice (`suppress` or `preserve`) at workflow dispatch.

The initial 131-action estimate was based on source-record comparison output.
The dedicated write planner deduplicates historical evidence by AniList media ID,
which is why the reviewed executable plan contains **130** unique missing entries.

## Resume point

When continuing:

1. Treat GitHub as the sole project workspace/source of truth.
2. PR #1 contains a fully working repo-hosted read-only migration flow; CI is green.
3. The private AniDB history secret is configured and the successful reviewed dry-run is run `37466671602`.
4. Read `docs/anidb-migration-review.md` for the current reviewed migration result and recommended completed-only policy.
5. The completed-only policy is approved. Use branch `feat/anidb-completed-only-write` and verified plan run `37471359927`.
6. Before apply, store a repo-safe `ANILIST_ACCESS_TOKEN` and choose whether the 130 imported completions should suppress or preserve AniList feed activity.
7. Run only the guarded workflow `.github/workflows/anidb-completed-only.yml` in `apply` mode with confirmation `APPLY_COMPLETED_ONLY_130`.
8. Keep the 42 partial-history entries out of this first write pass unless the user separately decides how they should be represented.


## Refreshed completed-only apply baseline

- User-selected activity behavior: **suppress** COMPLETED feed activity during apply, then restore and verify preferences.
- A guarded apply refused to proceed because the AniList snapshot changed.
- Read-only refresh run `37484756413` reviewed the new state.
- Current AniList entries: **27**
- Existing approved target entries: **24**, with **0 mismatches**
- Non-target entries: **3**
- Remaining missing approved Completed entries: **108**
- Refreshed snapshot fingerprint: `0d31a07c448e671a569ea106b4b7e7658c485ff0f6d69d65aa239f77f3208f06`
- Refreshed remaining-plan fingerprint: `2f7125acdb1053773180b21fa1c1962402890d84f181584859eb0f27130ea617`
- Apply confirmation is now `APPLY_COMPLETED_ONLY_108`.
