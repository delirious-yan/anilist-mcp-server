---
name: anilist-github-actions-write
description: Safely update one explicitly authorized AniList list entry via GitHub Actions when the authenticated AniList MCP is unavailable. Preserves scores and other unrelated state; verifies the real account and media before and after any mutation. Not for bulk imports or test mutations.
---

# AniList GitHub Actions fallback — domain-specific adapter

**Preferred path:** If an authenticated AniList MCP connection is actually available, use its targeted list tools and read-back. Use this GitHub fallback only for an explicit owner-requested AniList account change when the current runtime can work through this repository but lacks that authenticated MCP connection.

**Shared execution methodology:** An owner-trusted agent already independently authorized to read the private `delirious-yan/mind-self` repository should also load its [`github-actions-execution` shared skill](https://github.com/delirious-yan/mind-self/blob/main/skills/github-actions-execution/SKILL.md) for general workflow selection, authorization, runner isolation, least privilege, run evidence and cleanup. **Do not request private mind-self access for an external contributor.** This local guide must remain sufficient for a model with only this public repo.

GitHub repository access **alone** cannot mutate AniList. A carefully scoped workflow can use a *separately configured* `ANILIST_ACCESS_TOKEN` GitHub Actions secret. Its existence/validity must be established by safe execution; do not reveal, print, copy or commit its value. A previous successful run proves neither current access nor new write authorization.

## Preconditions specific to AniList

1. Read this repo's `AGENTS.md`, `docs/auth.md`, `docs/api-references.md` and relevant `src/tools/list.ts` / `src/clients/anilist/list.ts`. The live server/API and current owner instruction supersede an old example.
2. Verify the owner's **particular requested effect** (e.g., mark Season 1 complete). Confirm the intended account from authorized context. A Chaos tier, liking a show or completing a title **never** authorizes a guessed numerical AniList score.
3. Resolve the exact AniList **media ID** using AniList reads; cross-check anime type, alternate titles, season/format/year and episode total. Do not guess by a similar title, sequel, film or remake. Stop on ambiguity.
4. Read the existing list entry before writing. Capture its status, progress, score, notes, repeat count and all other potentially affected fields, including dates, privacy/custom-list state where the API exposes them. Completion/progress changes must preserve unrelated fields and any newer evidence.
5. A write to the **actual account** is not a mutation *test*. Tests are governed by `.agents/skills/mutation-test-safety/SKILL.md` and must capture, revert, then verify the revert. An authorized owner list update is supposed to persist.

## Narrow GitHub Actions execution

- Prefer a pre-existing, reviewed **single-entry** workflow if one genuinely exists. Never rerun `.github/workflows/anidb-completed-only.yml` or `anidb-dry-run.yml` for one new title: those are historical AniDB migration tools.
- When no suitable existing workflow is available, creating a **one-off workflow** is a real execution-capable code change and requires the requested AniList effect, repository trust rules and any required approvals. Prefer manual `workflow_dispatch` when available; otherwise a tightly scoped path-filtered push trigger on an authorized trusted branch was verified once on 2026-10-09. Do not relax branch protection to make it run.
- Run only reviewed, trusted code. Limit `GITHUB_TOKEN` to `permissions: contents: read`, use timeout and concurrency controls, and prefer isolated GitHub-hosted runners. Never run this secret-bearing workflow on an owner's self-hosted Windows runner without separate express authorization and an exact reviewed pin. Never feed untrusted PR/issue or workflow-input text into a shell/GraphQL executor.
- Inject the existing `ANILIST_ACCESS_TOKEN` secret only in the trusted job environment, and fail safely when absent. Do not create a new public credential, reveal a token, or print full authenticated GraphQL responses.
- Inside the job, query `Viewer { id name }` with the authenticated token and require an exact match to the intended AniList account. Read `Media(id: ..., type: ANIME)` and `mediaListEntry`; validate the expected identity/episode metadata **again just before mutation**.
- Refuse stale/conflicting states and inappropriate overwrites (e.g. current `REPEATING` status or unexpected progress). If already in the requested state, log an **idempotent no-op** rather than writing again.
- For completion/progress, call `SaveMediaListEntry` with **only** `mediaId` and specifically authorized `status`/`progress`. Do not pass scores, notes, dates, repeat count, privacy or preferences as defaults. Handle transport/GraphQL errors, timeouts and malformed responses as failures.
- **Read back the exact entry through authenticated AniList GraphQL**, confirm the requested status/progress, and check other exposed fields against the pre-state. Don't rely on the mutation's echoed result alone.

## Evidence and cleanup

1. Obtain the exact GitHub Actions run/job state and logs, matching workflow, event, trusted branch/ref and commit SHA. An uploaded workflow file or passing unrelated CI **does not prove** the account was updated.
2. Distinguish and report `applied and verified`, `already correct`, `failed`, `not executed`, or `unverified`. Show a run link when available; never fabricate execution.
3. Remove a one-time workflow after verified execution, or clean up an unsafe/failed attempt without destroying evidence. Do not repeatedly execute it just to make the logs nicer.
4. When separately authorized, reconcile the owner's private watch-history/preference system (e.g. Chaos tier in `mind-self`) without copying personal profiles or credentials into this public project. GitHub workflows update AniList **account data**; they do not intrinsically update private preferences.

## Verified historical example — not a standing trigger

On **2026-10-09**, the owner explicitly requested marking *The Wrong Way to Use Healing Magic* Season 1 complete (13 episodes):

- [One-off workflow commit `b134f7b`](https://github.com/delirious-yan/anilist-mcp-server/commit/b134f7b5bb1a5193637dcec9d8bd888b63d0eeae) — historical example only, not a generic script to replay verbatim.
- [GitHub Actions run 37904874917](https://github.com/delirious-yan/anilist-mcp-server/actions/runs/37904874917) succeeded: authenticated target identity confirmed, mutation submitted, `COMPLETED` and `13/13` independently read back.
- [Cleanup commit `fb5ee86`](https://github.com/delirious-yan/anilist-mcp-server/commit/fb5ee86ac45e6ead48e495bb9a6fca093d784514) removed the one-off workflow.

This run proves one authorized update **on that date**, not blanket account permissions or availability of a permanent workflow. Keep the generalized execution method in the shared `mind-self` skill and the AniList-specific safety contract here.
