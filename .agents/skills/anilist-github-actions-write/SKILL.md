---
name: anilist-github-actions-write
description: Safely update a single authorized AniList list entry through GitHub Actions when an authenticated AniList MCP connection is unavailable, using an existing Actions secret and verified read-back. Not for bulk imports, test mutations, or unapproved account changes.
---

# GitHub Actions fallback — authenticated AniList list update

**Use when:** The owner asks an AI assistant to mark an anime complete, update progress, or make another explicitly scoped change in their AniList list, but the current AI runtime exposes GitHub tools and **not** an authenticated AniList MCP client. This is a fallback, not a substitute for using a working authenticated MCP connection.

**Authority and separation:** A GitHub repo connection only permits repository operations; it does **not** itself authenticate against AniList. GitHub Actions can use a separately configured `ANILIST_ACCESS_TOKEN` **repository secret**. Confirm workflow execution and authenticated results before claiming any AniList update. Do not assume the token exists or is still valid.

This guide is independent of AI model/provider. The repository is the source of truth for implementation; private watch history, personal rankings and context belong in the owner's private context store, **not** in this public fork.

## Decision path

1. If an **authenticated AniList MCP** is connected, use its targeted read/mutation tools and re-fetch the entry to verify the change. Do not create a workflow.
2. Otherwise, check whether the GitHub connector has read/write access to this repository and whether a **safe existing workflow** supports the exact operation. Inspect any workflow before invoking it. Never rerun the historical AniDB bulk-migration workflow for a new one-title update.
3. If a suitable workflow is absent, GitHub workflows are permitted by repository policy, and the owner's **specific requested AniList write** is authorized, consider a **temporary, single-purpose Actions workflow** with minimal permissions. Writing to this repository alone is not permission to modify an AniList account. Respect any additional platform confirmation requirement.
4. If there is no safe runner, no authorized trigger capability, or no usable secret, report the precise blocker. Don't ask the owner to paste tokens into chat, commit credentials, impersonate an AniList write, or claim success from a GitHub commit alone.

## Before touching a real account

- Read `AGENTS.md`, `docs/auth.md`, relevant `src/tools/list.ts` / `src/clients/anilist/list.ts`, and this runbook. Source code and current AniList API take precedence over an old example.
- Derive the target **user**, anime, version/season, and requested fields from the owner's current instruction and trustworthy account context; never infer a numerical rating from a subjective tier label. If one essential identifier cannot be safely resolved, make the needed read-only query first; do not guess.
- Resolve the **AniList media ID** from AniList data, not loose title matching. Verify title, anime type, TV/movie format, year where available, and episode count; avoid silently selecting a sequel, remake, film or different season.
- Capture the current list entry first (including its existence, status, progress, score, notes, repeat count, private/custom-list settings, dates and any field at risk). Honor existing stronger/newer information. A completion request authorizes completion/progress, **not** modifying scores, notes, dates, activity settings or unrelated entries.
- Distinguish a **real requested change** from a mutation **test**: live tests follow `.agents/skills/mutation-test-safety/SKILL.md` (capture/change/revert). A real authorized owner update should **not** be reverted merely because it was verified.

## One-time workflow contract

- Prefer a manually dispatched, tightly reviewed `workflow_dispatch` workflow **if your current GitHub tools actually support dispatch**. If dispatch is unavailable but repository file writes and standard push-triggered Actions work, a newly committed, **one-off path-filtered push workflow on the trusted default branch** can be used. The owner-approved 2026-10-09 example followed this route. A code-writing operation is not itself proof the workflow fired.
- Restrict the workflow to the correct repository and trusted ref; run it on a GitHub-hosted runner, with `permissions: contents: read`, a timeout, and concurrency protection. Do **not** expose an arbitrary GraphQL query or shell script via workflow inputs; never execute untrusted PR code with secrets.
- Inject `ANILIST_ACCESS_TOKEN` only through `${{ secrets.ANILIST_ACCESS_TOKEN }}` into the job's environment. If absent, fail before any mutation. Never print or artifact tokens, authenticated headers, private notes or full personal-list payloads. Do not put credentials into the repository, `mind-self`, logs, chat, commits or issue text.
- First run authenticated `Viewer { id name }` and require an exact match to the **intended account** before writing. Verify the resolved `Media(id, type: ANIME)` metadata and existing `mediaListEntry` with a read-only GraphQL query.
- Build an **idempotent** precondition: if the entry already has the requested state, skip the mutation; refuse unexpected formats, episode totals, rewatch/repeating states, or conflicting/stale progress instead of forcing an overwrite.
- Use `SaveMediaListEntry` with **only** the specified target media ID and owner-authorized fields (e.g., `status: COMPLETED`, `progress: 13`). Do **not** pass other optional fields just to populate them. Preserve existing score, notes, repeat, privacy, custom lists, dates and preferences; compare read-back to the before snapshot wherever the API exposes those fields.
- Handle non-2xx responses, AniList GraphQL errors, empty results, timeouts and missing secret as failures. The mutation response alone is not proof of persistence: **query the exact same entry again** to verify status, progress and preserved fields.
- Keep workflow logs **minimal**: account/target identification suitable for the operator, whether a mutation or no-op occurred, and a verified final state. No token or private-content output. Do not turn on verbose request dumping.

## Verify, clean up and reconcile

1. Inspect the actual GitHub Actions run and job result/logs for the correct `head_sha`, workflow, branch and successful verification message. A passing unrelated CI workflow or a green commit status is **not** enough. Read GitHub Actions run data when available.
2. Record whether the outcome was a **mutation applied**, **already-correct no-op**, **failed**, or **not verified**. Only the first two may be reported as synchronized.
3. **Remove a temporary one-off workflow after success** (or disable/clean it up after failure, as safely appropriate) so it cannot be accidentally rerun. Cleanup must not erase the run's evidence. Retain the run ID and link; never repeat the write just to obtain a prettier log.
4. Where already legitimately authorized, update the **private** anime watch history/chaos classification and cross-agent handoff. The public repo must not receive personal tier rankings or private profile details. A numerical AniList score must not be invented from High/Mid/Low Chaos.
5. Explain accurately what was actually confirmed and what was not. Do not turn a previous day's success into an assumption of permanent GitHub access, secret availability or AniList status.

## Proven reference — 2026-10-09

One real owner-requested example (for **The Wrong Way to Use Healing Magic S1**, 13 episodes):

- One-time workflow commit: [`b134f7b`](https://github.com/delirious-yan/anilist-mcp-server/commit/b134f7b5bb1a5193637dcec9d8bd888b63d0eeae) — inspect the actual committed workflow, **adapt** the media ID, identity checks and account verification, do not blindly replay it.
- Verified GitHub Actions run: [37904874917](https://github.com/delirious-yan/anilist-mcp-server/actions/runs/37904874917) — logs confirm mutation submitted and a fresh authenticated read-back of `COMPLETED`, `13/13`.
- Cleanup commit: [`fb5ee86`](https://github.com/delirious-yan/anilist-mcp-server/commit/fb5ee86ac45e6ead48e495bb9a6fca093d784514) — removed the temporary workflow after verification.

**This example is evidence of a working fallback on that date only.** It is not a standing authorization for further AniList mutations, a general automation, a bulk migration, or an indication that this repo's own source files are executed by a GitHub connection.
