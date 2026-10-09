# AniDB → AniList Migration Handoff

## Development workflow

- **GitHub/repository is the sole source of truth.** Do not require or depend on a local checkout for project work.
- All implementation, review, validation, CI, documentation, and migration tooling changes must be performed through the repository and GitHub Actions/remote repo workflows.
- Do not instruct the user to `git pull`, run local builds/tests, or maintain a local project copy as part of the normal workflow.
- Any step that appears to require localhost-only execution must be redesigned into a repo-hosted/remote-safe flow before it is treated as a required project step.

## Future single-title AniList updates — independent of historical migration

For an explicit owner request to update one AniList entry, use an authenticated
AniList MCP client when available. If it is **not** exposed in the assistant's
runtime but GitHub is accessible, follow the agent-neutral
[`anilist-github-actions-write` skill](.agents/skills/anilist-github-actions-write/SKILL.md)
for the verified GitHub Actions fallback. It describes scoped secret use,
account/media/pre-state checks, idempotent mutation, read-back, run verification
and disposal of one-off workflow files.

The 2026-10-09 case succeeded using run
[37904874917](https://github.com/delirious-yan/anilist-mcp-server/actions/runs/37904874917)
and the one-off workflow was deleted afterward. This is **not** a current
permanent workflow and does not promise secret or Actions access in other AI
environments. Do **not** rerun either AniDB migration workflow for a new
completion; those workflows concern historical bulk migration only.

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

The repo-hosted migration tooling is implemented and the completed-only migration
has been executed against `Luciedmeo`.

Read-only baseline:

- Dry-run run `37466671602`: successful, zero writes.
- Mapping result: 196 exact, 10 fallback, 1 curated split, 1 curated no-op,
  0 unresolved.
- Historical state: 132 Completed targets, 42 partial-history entries,
  14 unwatched, and 20 unknown.
- The user approved the completed-only migration policy.
- The guarded write phase was merged to `main` via PR #2.

Execution choices:

- AniList activity mode: **suppress** during historical Completed imports, then
  restore and verify.
- Adult-content visibility: user approved **temporary enable** only for the
  migration, followed by restoration and verification.
- No scores or historical dates are imported.
- Partial, unwatched, and unknown history remains untouched.

Write execution:

- Interrupted apply run `37555042109` successfully created **58** approved
  Completed entries before encountering an AniList episode-count incompatibility.
  The failing entry was rolled back. Activity and adult-content preferences were
  restored and verified.
- Diagnostic run `37557256796` found exactly two compatibility exceptions:
  - AniDB `5406` → AniList `2966`: historical progress 12, AniList episode
    count 13.
  - AniDB `6327` → AniList `5081`: historical progress 12, AniList episode
    count 15.
- Those two were intentionally excluded rather than overstating watched progress.
- Resumed apply run `37557510964` successfully created the remaining
  **48 compatible entries**.
- During the resumed run, temporary adult visibility was enabled and verified,
  all previously unavailable adult-only targets passed preflight, Completed feed
  activity remained suppressed, and both account preferences were restored and
  verified afterward.

Final verification:

- Final read-only verification run: `37564331110`.
- AniList entries visible with temporary adult visibility: **133**.
- Historical Completed target entries now present and matching: **130 / 132**.
- Target mismatches: **0**.
- Remaining actions: exactly **2**, both the episode-count compatibility
  exceptions above.
- Compatible remaining actions: **0**.
- Adult-content visibility was restored to its original value: **false**.
- No additional automatic completed-only writes are justified.

See `docs/anidb-migration-final.md` for the final migration record.

## Final migration state

The completed-only migration is **finished** under the approved conservative
policy.

The two remaining historical records are deliberately not marked Completed
because AniList models more episodes than the watched evidence proves. They must
not be forced to Completed without a separate explicit user decision.

The 42 partial-history entries also remain unchanged. They are preserved as
historical evidence for a future, separately reviewed migration phase.

## Resume point

When continuing this project:

1. Treat GitHub as the sole project workspace and source of truth.
2. Consider the completed-only migration complete at **130 of 132** safely
   representable historical Completed targets.
3. Do not rerun the completed-only writer as a normal next step.
4. If the user wants to continue migration work, review the **42 partial-history
   entries** as a separate phase.
5. Keep AniDB `5406` → AniList `2966` and AniDB `6327` → AniList `5081`
   excluded unless the user separately decides how the episode-count mismatch
   should be represented.
6. Preserve existing/newer AniList data, and continue to avoid importing AniDB
   community ratings as personal scores or uncertain historical dates.
