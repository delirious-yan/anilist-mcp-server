# AniList — standard update workflow (2026-10-20)

> **Authoritative owner directive:** Work on this repository directly on `main`. **Do not create a branch, pull request, reviewer requirement, or merge step.** For owner-authorized personal AniList list completion updates, use one and only one execution route:
>
> `anilist-requests/current.json` → direct commit to `main` → existing `AniList single or batch sync` GitHub Actions → authenticated readback for **every** requested entry.
>
> No Work-mode handoff, Jules review, one-off workflow, historical migration script, alternate direct mutation, or PR-based fallback. Branch protection and platform safeguards remain authoritative; report a real GitHub block rather than circumventing it.

## Normal list update — execute all steps

1. **Verify instruction and identity.** The owner must explicitly request the live change, targeting AniList account `Luciedmeo`. Resolve exact AniList media IDs and matching romaji/English titles, format/season/cour and episode totals. Separate seasons and special entries may have distinct IDs. Do not infer a numerical AniList score from private Chaos tiers, praise or completion. Do not change any unrelated fields.
2. **Read trusted source.** Inspect `anilist-requests/current.json` on `main` using GitHub `fetch_file` and retain its current blob SHA. The reusable implementation is `.github/workflows/anilist-single-entry-sync.yml` running `scripts/sync-anilist-request.mjs`. No workflow/script edits are needed for ordinary list updates.
3. **Replace the whole request snapshot**, not append to older requests. Supply 1–25 unique IDs using the supported structure (this is an illustrative **historical** verified title, not a standing instruction to reapply it):
   ```json
   {
     "entries": [
       {
         "mediaId": 138788,
         "expectedTitle": "Under Ninja",
         "expectedEpisodes": 12,
         "status": "COMPLETED",
         "progress": 12
       }
     ]
   }
   ```
   `progress` must equal the actual verified episode count. Only `COMPLETED` is currently supported.
4. **Commit directly to protected `main`**, using GitHub `update_file` with the exact current blob SHA, complete JSON, `branch: "main"` and an accurate commit message. No branches, PRs, native reviews, self-approval, merge or manual CI gate. Do not race concurrent edits to the same file. If GitHub rejects the operation, report the actual error and stop; do not silently switch routes.
5. **Follow the actual sync run.** Find the GitHub Actions workflow named `AniList single or batch sync` with event `push`, head branch `main` and exact head SHA equal to the successful request-file commit. Require `completed/success` for its `sync` job; unrelated test/quality CI is not proof of an AniList mutation.
6. **Verify account and each item from authenticated logs.** For **every** media ID, require the exact outcome `VERIFIED account=Luciedmeo mediaId=<id> status=COMPLETED progress=<n>`. The maintained script checks `Viewer` account name, media identity and exact episode count, refuses conflicting/regressive states, performs `SaveMediaListEntry` only for requested status/progress when needed, then reads back and compares preserved fields (score, notes, repeats, privacy, lists, dates, etc.). No `VERIFIED` readback = no verified success.
7. **Report concisely and keep continuity.** Give the result for each media and the real sync run link. When separately appropriate for an already owner-trusted agent, reconcile `mind-self` private watch history and explicit Chaos tiers; never copy private tiers into this public request or invent numerical AniList scores.

## Hard rules

- **Reject all superseded execution methods** for routine AniList account updates: PR-based workflow, Jules/external review, one-off workflow, AniDB migration jobs, manual rerun of historical migration workflows, ad hoc local GraphQL writes, direct MCP list writes as a substitute for the maintained request-file workflow, dispatch of arbitrary workflows, or installing alternate app/tool routes. Historical examples remain in Git history for audit, not as instructions.
- The same **direct-`main`, no-PR** owner policy applies to **other work in this AniList repository**, such as code and documentation updates. Those changes still require proportionate testing, review of risks, appropriate authorization and obeying GitHub's enforced rules. Only changes to `anilist-requests/current.json` trigger the maintained AniList sync job; editing this documentation must not write to AniList.
- Do not change the existing `ANILIST_ACCESS_TOKEN` secret, expose credentials, modify the workflow to avoid verification, run on the owner's self-hosted workstation, relax repository protections, or treat mere repository access as live account write authorization.
- Batches are sequential, **not atomic**. If a later item fails, prior items may have changed. Inspect authenticated per-ID state before retrying; report partial outcomes.
- Connector safety-check rejection is distinct from GitHub HTTP 409/403 or failed Actions. An ordinary authorized retry can be tried but never disguise an operation to bypass safety checks. GitHub rules and the executing actor's permissions must be checked live.

## Verified reference — October 20, 2026

The maintained mechanism was verified by [GitHub Actions run #39423520973](https://github.com/delirious-yan/anilist-mcp-server/actions/runs/39423520973), event `push` on `main`, exact commit [`88a95073`](https://github.com/delirious-yan/anilist-mcp-server/commit/88a95073ddfaa45f9b861118e66c447603c10598). The job succeeded, authenticated `Luciedmeo`, and independently logged:

- `117612`: *How a Realist Hero Rebuilt the Kingdom* Part 1 — `COMPLETED 13/13`
- `139648`: *How a Realist Hero Rebuilt the Kingdom* Part 2 — `COMPLETED 13/13`
- `138788`: *Under Ninja* — `COMPLETED 12/12`

All three were read back; no numeric scores were written. The historical reference commit came from [merged PR #10](https://github.com/delirious-yan/anilist-mcp-server/pull/10), **not** from a direct push. The owner has now rejected that PR step for future work. The verified reusable *sync mechanism* is the same; a separate successful direct documentation commit establishes that the now-updated branch rules permit no-PR editing. Do not conflate the two types of evidence.

This file supersedes earlier AniList workflows and fallbacks. For general repository tasks, follow `AGENTS.md`; for the specific account updater skill, follow `.agents/skills/anilist-github-actions-write/SKILL.md`, which must point back to this procedure.
