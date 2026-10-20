---
name: anilist-github-actions-write
description: Canonical owner-authorized AniList list completion update via a direct-main GitHub request-file commit and authenticated per-item GitHub Actions readback. No PRs, reviews, temporary workflows or alternative account-mutation paths.
---

# AniList list updates — only authorized standard route

**Canonical instructions:** [`docs/anilist-sync-workflow.md`](../../../docs/anilist-sync-workflow.md) is the maintained execution contract for all AniList completion updates. This skill is the implementation checklist, **not** an alternate route.

**Owner's standing route decision (2026-10-20):** No branches, pull requests, reviewer approval, merges, Jules, Work mode or handoff are required for AniList repository operations. Work **directly on `main`**, within GitHub's actual protections. Other code changes still require appropriate validation, but not PRs. Live account changes always require a specific owner instruction about the intended effect.

## One supported production-update workflow

1. Confirm the particular owner-approved list operation for AniList account **`Luciedmeo`**. Verify each anime's AniList **media ID**, title/alias, type, season/cour and **episode count** from independent media evidence. Do not infer completion, season grouping or a numeric AniList score from private taste rankings.
2. Read the existing `anilist-requests/current.json` from GitHub `main` with `fetch_file` and preserve its current **blob SHA**. Consult `.github/workflows/anilist-single-entry-sync.yml` and `scripts/sync-anilist-request.mjs` for the maintained execution contract. These are existing reviewed/trusted components: do **not** create new one-off or migration workflows.
3. Replace `anilist-requests/current.json` with only the currently requested entries (1–25 distinct media IDs). Each has `mediaId`, `expectedTitle`, `expectedEpisodes`, `status: "COMPLETED"` and equal `progress`. No score, notes, privacy, date or custom-list fields belong in the input. Validate JSON and identity; no obsolete requests in the batch.
4. GitHub `update_file` the request **directly to `main`** using the fresh blob SHA, full replacement file, and a descriptive commit message. No feature branch, PR, review or merge gate. If GitHub or the connector blocks the write, report **blocked** with the exact reason; do not create a PR as a workaround, modify rulesets, or change execution route.
5. Confirm exact commit SHA maps to GitHub Actions `AniList single or batch sync` run, event `push`, branch `main`. Require the **sync** job to complete successfully and one **authenticated** `VERIFIED account=Luciedmeo mediaId=<id> status=COMPLETED progress=<n>` result for **every** requested ID.
6. Report **applied and verified**, **already correct and verified**, **partial**, **blocked**, **failed**, **not executed**, or **unverified** accurately. Match IDs/status/progress to owner request, not just GitHub CI color or a committed file. When authorized and applicable, update private `mind-self` watch-history/Chaos tiers separately.

## Identity, security and field preservation

The maintained Actions script obtains the pre-state, verifies `Viewer` is the intended account, matches exact media identity and episode total, refuses `REPEATING`/unexpected regressive progress, and calls `SaveMediaListEntry` with **only** specifically authorized `mediaId`/`status`/`progress`. Afterward it reads the exact entry again and checks status/progress plus relevant existing fields: score, notes, repeats, dates, privacy and custom lists. No speculative numerical AniList ratings or additional fields.

Keep the existing `ANILIST_ACCESS_TOKEN` secret inside GitHub Actions. Never print, retrieve, copy, commit or forward it. Workflow needs only `contents: read`, isolated `ubuntu-latest`, existing timeout and concurrency settings. Do not run it on the owner workstation, alter its trigger, rerun it with unrelated/historical request data, or use ad hoc GraphQL/API requests as a replacement. A user-authorized real update is persistent, not a reversible mutation test.

The existing batch script is **sequential and non-transactional**. A failure may leave earlier entries applied; examine all per-item results and authenticated account state before retrying. Do not claim all items were updated if one lacks readback. Connector safety checks and actual GitHub permissions are separate gates; neither can be evaded.

## Reject superseded methods

- New one-off workflows, adapting the old Dungeon Meshi/86 single-use workflows, old AniDB migration scripts, direct AniList MCP/GraphQL list writes as an alternate path, generic `workflow_dispatch` as a substitute for changing the request snapshot, and handoff-to-Work as a prerequisite.
- PRs and merges for ordinary list updates or other AniList repository development; the owner specifically chose direct `main` work. Do not request PR approval, run Jules, or substitute a PR after an update is blocked.
- Any claim that green CI, a commit, or a successful PR alone proves account changes. Authenticated per-entry `VERIFIED` readback is mandatory.

## Verified historical reference

The **maintained request-and-sync mechanism** worked on 2026-10-20: trusted `main` push [`88a95073`](https://github.com/delirious-yan/anilist-mcp-server/commit/88a95073ddfaa45f9b861118e66c447603c10598) triggered [sync run #39423520973](https://github.com/delirious-yan/anilist-mcp-server/actions/runs/39423520973). Account `Luciedmeo` authenticated and independently verified Realist Hero Part 1 `117612` **13/13**, Part 2 `139648` **13/13**, and Under Ninja `138788` **12/12**, all `COMPLETED` with no numerical score added.

That run originated from a historical PR merge. **Future operation is no-PR direct-`main` as authorized by the owner**; the reusable request/runner/readback mechanism is unchanged. Earlier experiments remain evidence in Git history, not active instructions.
