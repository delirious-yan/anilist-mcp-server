# AniList updates — canonical workflow

## Owner rule

All work in this repository uses direct commits to `main`. No feature branches, pull requests, reviewers, Jules reviews, separate merge steps, or mandatory Work mode.

For owner-authorized AniList account completion updates, use **only** the existing request-file workflow:

`anilist-requests/current.json` → direct `main` commit → `AniList single or batch sync` GitHub Actions → authenticated readback for each entry.

Do not use one-off Actions jobs, historical AniDB migration flows, ad hoc GraphQL scripts, alternate MCP account writes, or reruns of old sync requests. Preserve existing account fields and never infer a numerical AniList score from a private Chaos tier.

## Standard execution

1. Require explicit owner approval for the actual AniList change. Target account `Luciedmeo`. Verify each exact anime media ID, title or alias, season, format, and episode count against AniList. Separate seasons or cours can be separate media IDs.
2. Fetch `anilist-requests/current.json` from `main` with the GitHub `fetch_file` tool and keep its current blob SHA. Check the existing `scripts/sync-anilist-request.mjs` and `.github/workflows/anilist-single-entry-sync.yml` if their behavior has changed. Do not edit them for routine updates.
3. Replace the entire request snapshot with the current owner's intended entries only. Use an `entries` array containing 1–25 distinct media IDs. Each entry must have `mediaId`, `expectedTitle`, `expectedEpisodes`, `status` set to `COMPLETED`, and `progress` equal to the verified episode count. Do not leave stale entries or include scores and unrelated fields.
4. Commit `anilist-requests/current.json` directly to `main` using GitHub `update_file`, full replacement content, the latest blob SHA, and a descriptive commit message. Never open a PR as a fallback. If GitHub rejects the write, report the exact blocker and stop.
5. Match the resulting commit SHA to the GitHub Actions run named `AniList single or batch sync`. Require event `push`, branch `main`, the exact head SHA, and `completed/success` for the `sync` job. Ordinary passing CI is not proof of AniList synchronization.
6. Inspect authenticated job logs for one `VERIFIED` record per requested media ID, including the exact account `Luciedmeo`, status `COMPLETED`, and requested progress. The existing script validates the authenticated account and media, changes only authorized status/progress, rereads the entry, and verifies unrelated fields were preserved.
7. Report the actual verified results and link the exact run. Reconcile explicit private watch-history or tier changes in `mind-self` separately. Never invent a numerical AniList score.

## Mandatory safety checks

- Keep `ANILIST_ACCESS_TOKEN` in the existing GitHub Actions secret. Do not expose, copy, or commit credentials.
- Only the request file triggers the live sync. Documentation, tests, or application code changes must not be reported as AniList account updates.
- Sync requests are sequential, not atomic. A failed later entry may leave earlier entries updated. Check each ID independently before retrying.
- Treat connector safety blocks separately from GitHub HTTP errors. Do not bypass a restriction or disguise a forbidden action.
- Normal code changes also go directly to `main`, but retain appropriate tests, risk checks, authorization, and any protection GitHub currently enforces.
- Reject older PR-based, one-off workflow, historical migration, alternate-tool, and unverified update methods as active instructions.

## Verified reference

On October 20, 2026, the maintained request-file method ran successfully on `main` at commit [`88a95073`](https://github.com/delirious-yan/anilist-mcp-server/commit/88a95073ddfaa45f9b861118e66c447603c10598). [AniList run 39423520973](https://github.com/delirious-yan/anilist-mcp-server/actions/runs/39423520973) independently authenticated user `Luciedmeo` and verified:

- Realist Hero Part 1, media `117612`: `COMPLETED 13/13`.
- Realist Hero Part 2, media `139648`: `COMPLETED 13/13`.
- Under Ninja, media `138788`: `COMPLETED 12/12`.

That historical run followed a merged PR. The owner has superseded that PR step with direct commits to `main`. Subsequent public documentation commits `0aed68d`, `4fb2a29`, and `2712670` prove that the no-PR write route is now permitted. A new direct-request account sync must still be authenticated and verified on its own actual run.

This document is authoritative for AniList account updates and supersedes previous update processes.
