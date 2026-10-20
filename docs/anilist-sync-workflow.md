# AniList completion updates: request to verified account state

Use the maintained request-file workflow for an explicitly authorized completion update.
Work mode is not a prerequisite for GitHub operations. A PR is not an account update.

## Required state transitions

| State                         | Evidence required before advancing                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Requested                     | Owner-authorized account, exact seasons, status and progress; no guessed score       |
| Identity verified             | Independent AniList ID, romaji/English title, anime format/year and episode count    |
| PR opened                     | Request-only branch and PR into protected main; exact head SHA recorded              |
| Checks passed                 | Current head has all required Node 20/22/24 and quality checks                       |
| Review approved               | Required independent approval and resolved conversations; no bypass or self-approval |
| Merged                        | GitHub confirms merge into main; record merge SHA                                    |
| Execution pending             | Matching main-push sync run identified; queued/running is not success                |
| Applied and verified          | Every requested ID has authenticated account readback and preservation checks        |
| Already correct               | Authenticated pre-state matched; no mutation; fresh readback still passed            |
| Blocked / failed / unverified | State exactly which gate or item failed; do not claim the batch synced               |

Branch rules and check names must be inspected afresh. Passing ordinary CI never proves
AniList execution. A queued check has no test result; a missing approving review remains a gate.

## Execute the authorized request

1. Read this guide, the [write skill](../.agents/skills/anilist-github-actions-write/SKILL.md),
   current request, script and workflow. Confirm the account is `Luciedmeo`.
2. Verify each identity independently against AniList before merging. The job repeats exact
   ID/type/title/episode checks immediately before each mutation. Public title pages establish
   media identity, not authenticated account state.
3. Use one request object or `{ "entries": [ ... ] }` with 1–25 distinct IDs. Required fields:
   `mediaId`, `expectedTitle`, `expectedEpisodes`, `status: "COMPLETED"` and matching
   `progress`. Verify movies rather than assuming 1/1.
4. Read current main and the request blob SHA, create a feature branch, update only
   `anilist-requests/current.json`, and open a PR. Preserve concurrent changes with SHA checks.
   Do not change the script or workflow for an ordinary completion request.
5. Inspect protected checks, approval and conversations at the current PR head. Merge only
   through permitted operations after all required gates pass. Never use an admin bypass
   to substitute for missing review or failed checks.
6. The merge push changing the request path activates
   `.github/workflows/anilist-single-entry-sync.yml`. Match the run's event, main ref and
   merge SHA. Read its job conclusion and item-level logs.
7. Require `VERIFIED account=Luciedmeo mediaId=... status=COMPLETED progress=...` for every ID.
   Newer script output adds `outcome=APPLIED` or `outcome=ALREADY_CORRECT` only after readback.
   Older logs without an outcome suffix prove verified state, but not which path occurred.
8. Record the PR, merge, run and verified item outcomes. Reconcile private preferences only
   in the owner's private system. Preserve scores, notes, dates, repeats, privacy and lists.

## Failures, retries and missing capabilities

The batch is sequential, not transactional. If a later item fails, earlier items may have
changed. A mutation echo without fresh successful readback is unverified. Preservation
failure can occur after a write; inspect the actual entry before any recovery. Do not
automatically roll back account state or replay the entire batch.

Manual dispatch reruns the current request at its selected ref. Use only reviewed trusted
main code, recheck that the request still matches the authorized effect, and inspect prior
runs before dispatching. Never rerun a batch merely to obtain nicer logs. Missing/expired
secrets or the wrong Viewer account must fail; never print, copy or request secret values.

A connector safety rejection differs from GitHub HTTP 401/403/409/422 and from an AniList
error. Do not disguise or split a rejected operation to bypass a restriction. Report the
actual boundary and use a permitted path; do not invent the cause.

## Regression QA

`npm run test:sync` executes the actual CLI in isolated child processes using synthetic
responses and a fetch implementation with no network fallback. It checks minimal mutation
fields, independent readback, no-op behavior, account/identity/conflict guards, metadata
preservation, malformed batches, API failure and partial-batch reporting. It runs in the
existing Node 20/22/24 and quality CI through the test scripts. These tests establish code
behavior only; live account success still requires the secret-backed workflow.

The maintained workflow stays path-filtered, read-only for GitHub contents, time-bounded
and serialized. Do not add owner-workstation runners or migration workflows for routine updates.
