# AniList update method (single or batch)

## Standard procedure

1. Require explicit owner authorization for each AniList change. Confirm account `Luciedmeo`, media IDs, titles, episode counts, and intended status before committing. Keep private rankings in `mind-self`, never in this public repository.
2. Read `anilist-requests/current.json`, `scripts/sync-anilist-request.mjs`, and `.github/workflows/anilist-single-entry-sync.yml` before changing behavior. For one title, the request may be one object; for multiple titles, use `{ "entries": [ ... ] }` (1–25 distinct IDs). For a completion request, each entry uses `mediaId`, `expectedTitle`, `expectedEpisodes`, `status: "COMPLETED"`, and `progress` equal to the expected episode count. For a **score-only** request, use `mediaId`, `expectedTitle`, `expectedEpisodes`, and `score` on a 0–10 scale in tenths (e.g. `7`). Score-only requests require an existing list entry and preserve its current status and progress. Do not combine score with status/progress. Movies generally use 1/1 for completion, but verify rather than assuming.
3. Use GitHub connector `fetch_file` to obtain the current blob SHA, then `update_file` with the full replacement and that SHA. Avoid concurrent writes to the same file. Open a feature-branch PR against protected `main`; require passing checks and an eligible independent GitHub approval before merging. No direct-main push, self-review or protection bypass. The merge push triggers the existing workflow. Do not modify the workflow or script for ordinary list updates.
4. Inspect the exact workflow run, job conclusion, and job logs. Require an authenticated `VERIFIED account=Luciedmeo mediaId=... status=COMPLETED progress=...` or `VERIFIED account=Luciedmeo mediaId=... score=...` line for **every** requested entry. A green GitHub job alone is less informative than item-level verification. If one fails, do not claim the whole batch succeeded; check which preceding entries were already applied before retrying.
5. Reconcile any owner-approved tier changes in the private `mind-self` ranking independently. Report exact verified outcomes and links briefly.

## GitHub connector write-block troubleshooting

A connector error saying `This tool call was blocked by OpenAI's safety checks` is not itself a GitHub HTTP permission or branch-protection error. Do not infer a revoked token or broken AniList workflow without GitHub-side evidence. Check whether reads work, compare arguments against a previously successful `fetch_file` + `update_file` sequence, and distinguish GitHub API errors (401/403/409/422) from a pre-execution safety block. Do not attempt to circumvent a safety restriction by disguising a request, changing endpoints, or splitting forbidden actions. If an ordinary authorized retry is allowed and succeeds, record the outcome but do not assert the precise internal reason for the earlier block. If restrictions persist, stop and request an approved alternative execution path.

## Observed evidence (2026-10-15/16)

- A prior single-entry request completed and authenticated read-back verified media 199547 (13/13), run 38769935865.
- Some later GitHub file writes returned a connector safety-check block with no GitHub HTTP response. The cause was not exposed.
- Subsequent ordinary `update_file` calls succeeded without a permission or token change: batch script commit `09fd066`, workflow labeling commit `7ad38a5`, request commit `bd2ba99`; private ranking update commit `69bf69a`.
- Batch run 38772060618 completed successfully and logged three individual authenticated verifications: media 617, 2236, and 5681, each 1/1.
- Therefore the evidence supports intermittent or request-dependent connector-side rejection, **not** a confirmed underlying root cause. Repository writes and GitHub Actions execution demonstrably worked afterward.

## Current constraints

The script supports guarded completion and score-only updates. It requires exact media identity, title match against AniList romaji/English and exact known episode count. Completion refuses repeating/regressive progress. Score-only requires an existing entry, uses the account-independent `scoreRaw` 0–100 scale, and verifies no changes to status, progress or other fields. Batch updates are sequential, not transactional: an error on a later entry can leave earlier entries applied. A manual `workflow_dispatch` reruns the current request file. Keep the workflow's Node.js 24-compatible `actions/checkout@v5`.
