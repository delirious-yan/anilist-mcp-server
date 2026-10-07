<!-- mind-self-bootstrap -->
## mind-self bootstrap — owner standing instruction

For any AI model Ian chooses to use, before substantial work or answering a repo-state question, load the private cross-agent context repository `delirious-yan/mind-self`.

Read, in order:

1. `AGENTS.md` in mind-self;
2. relevant material from `profile/INDEX.md`;
3. `projects/INDEX.md` and this project's `PROJECT.md` / `HANDOFF.md` entry when present;
4. `skills/INDEX.md` and any relevant shared `SKILL.md`.

Then return here and follow this repository's own instructions and current code/handoff. This repository remains authoritative for its implementation state.

If GitHub or mind-self access is unavailable or insufficient, ask Ian to grant/approve full GitHub access. Do not silently downgrade to a model-specific restricted workflow.

Ian grants the AI models he chooses standing permission to use full task-relevant GitHub read/write access once connected and to write durable personal/project context back to mind-self without routine per-write approval. mind-self changes must follow its provenance and audit rules.



### owner command semantics

When Ian says `check mindself`, `check mind repo`, `check self repo`, `use mindself`, or an obvious equivalent, that explicitly authorizes reading mind-self **and writing the reconciliation delta back to mind-self** under its protocol.

For these commands, `check` is not read-only.

This standing authorization is limited to mind-self maintenance and continuity metadata. It does not by itself authorize unrelated changes in this repository or any external/production/customer-facing system.

### automatic persistence on fresh instances

No introduction to mind-self is required. If an AI in this project encounters, opens, or reads mind-self, that discovery is sufficient to activate its bootstrap, reconciliation, persistence, and synchronization rules.

For this project, `delirious-yan/mind-self/state/reconciliation.json` tracks whether the one-time historical backfill has been completed.

- Reconciliation is tracked per provider/environment source in `delirious-yan/mind-self/state/reconciliation.json`. If this source has no completed entry for this project, encountering mind-self triggers its initial historical reconciliation automatically. Another model/provider's completion does not count for this source.
- After this source environment completes its initial reconciliation, every fresh instance from the same source automatically runs delta reconciliation against mind-self before substantial work. Ian does not need to ask again.
- A startup reconciliation may produce no writes when there is no meaningful delta.
- Update this source's reconciliation entry using an authoritative runtime/platform timestamp after a successful reconciliation. Never estimate timestamps.
- Do not repeatedly bulk-import prior context; follow mind-self's semantic deduplication and ingestion protocol.

For newly created Ian-owned projects after this protocol is known, initial enrollment and reconciliation happen automatically on first substantial AI access with GitHub available; no one-time backfill prompt is required.

### mind-self synchronization

Treat this repository and mind-self as virtually connected by agent protocol. In the same task:

- when this project's handoff is created or materially updated, reconcile the corresponding mind-self project handoff;
- when a project skill is created, installed, removed, or materially changed, register/update it in the corresponding mind-self project context and promote it to the shared mind-self skill library when it is reusable across projects;
- when durable project purpose, architecture, constraints, relationships, source-of-truth rules, or long-lived decisions change, reconcile the mind-self project overview;
- append the required mind-self audit entry.

Do not make Ian manually request this synchronization. The project repo remains authoritative for detailed implementation state; mind-self remains authoritative for portable cross-agent context and continuity.

# AGENTS.md

Single source of truth for working on this repository — for **any** model or
agent. `CLAUDE.md` only links here (`@AGENTS.md`); keep all shared guidance in
this file, not in CLAUDE.md. (For end-user/runtime docs, see [README.md](README.md).)

## Project shape

A TypeScript MCP server for the [AniList](https://anilist.co) GraphQL API.
Reads (search/details/genres/tags/recommendations/threads/activity/public user
data) call the public GraphQL endpoint directly and need no credentials.
Personal-list and social tools (add/update/remove list entries, favourites,
follow, posting/deleting activity or threads, `update_user`, `get_notifications`)
act on the authenticated user's own AniList account and require a user access token —
see [docs/auth.md](docs/auth.md) for the OAuth model and [docs/api-references.md](docs/api-references.md)
for AniList's API specifics (rate limits, mutation semantics, considerations)
before changing the client.

```
src/
  index.ts        # bin entry — calls start()
  server.ts       # buildServer() + start(); registers everything
  config.ts       # env → validated Config (zod)
  version.ts      # VERSION constant, kept in sync with package.json (checked by a test)
  lib/            # http, rateLimit, cache, tokenStore, oauthLogin, errors, logger,
                  # result, graphql (the GraphQL request/error-mapping layer)
  clients/        # anilist.ts — thin AniListClient facade (auth/config/login,
                  # exposes ctx(): AniListContext); anilist/*.ts — one file per
                  # domain (activity, context, favourites, fields, list, media,
                  # misc, notification, people, recommendation, search, thread,
                  # user), matching src/tools/*. Tool handlers call these
                  # domain functions directly (e.g. `media.getMedia(client.ctx(), ...)`)
                  # rather than through a same-named method on AniListClient.
                  # anilist/ids.ts — branded numeric-ID type aliases (MediaId,
                  # ListEntryId, etc.), one per domain concept; every domain
                  # file's exported functions take these instead of plain
                  # `number` so e.g. a MediaId can't compile where a
                  # ListEntryId is expected. Compile-time only — see the
                  # file's own comment for why it has no zod runtime import.
                  # anilist/enums.ts — single source for the AniList enums
                  # re-typed on both sides of the boundary (MediaType,
                  # MediaListStatus, FavouriteKind, birthday kinds): one
                  # `as const` array per enum, feeding z.enum() in tools/ and
                  # the derived `(typeof X)[number]` type in these domain
                  # signatures, so runtime validation and the compile-time
                  # types can't drift. Lives here (not tools/) because
                  # clients/ can't import from tools/.
  tools/          # misc.ts, activity.ts, list.ts, media.ts, notification.ts,
                  # people.ts, recommendation.ts, search.ts, thread.ts, user.ts,
                  # login.ts, guard.ts (never-throw wrapper), outputSchemas.ts
                  # (shared output-schema fragments, incl. anilistId and its
                  # per-domain branded variants — mediaId, listEntryId, etc.)
  prompts.ts      # MCP Prompts: multi-step plans that orchestrate the read tools
  __tests__/      # node:test (*.test.ts) + helpers.ts
scripts/          # build-tests.mjs, run-tests.mjs, check-api.mjs, sync-version.mjs
                  # (+ its sync-version.d.mts type-declaration companion),
                  # preversion-check.mjs (npm `preversion` gate — see the `release` skill)
.agents/skills/   # reusable agent workflows for this repo (e.g. live-audit/) —
                  # plain Markdown with a YAML frontmatter name/description,
                  # not tied to any one tool's orchestration features, per
                  # this file's agent-agnostic policy; same skill name/layout
                  # as this project's sibling MCP servers (tmdb-mcp, mal-mcp,
                  # steam-games-mcp) — sync improvements both ways rather
                  # than letting them drift. `.claude/skills` is a symlink
                  # here (Codex CLI/Gemini CLI read `.agents/skills`
                  # directly, Claude Code the symlink), so no skill content
                  # is duplicated per client path.
```

## Why this server exists

The pre-existing third-party `anilist-mcp` (npm) cannot write list entries at
all — its `add_list_entry`/`update_list_entry` require nested-object input
fields, but its GraphQL-mutation builder throws on any nested value (a
confirmed upstream bug, [anilist-mcp#13](https://github.com/yuna0x0/anilist-mcp/issues/13)).
This server avoids that whole bug class by talking to AniList's GraphQL API
directly through a small first-party client (`lib/graphql.ts` +
`clients/anilist.ts`) instead of a third-party wrapper library: it builds its
own `variables` object and only includes keys that are actually set — GraphQL
naturally omits absent optional arguments, no dummy placeholder values needed.

## Commands

```sh
npm run build          # tsc --noEmit + tsup → dist/index.js (single ESM bundle)
npm test               # build tests with esbuild, run with node:test
npm run test:coverage  # same, with coverage (gate: ~80%)
npm run lint           # eslint
npm run format         # prettier --write
npm run check:api      # live upstream health-check (network)
```

## Conventions

- **Docs and in-code text are English** (README, docs, comments, tool
  descriptions, error messages).
- Runtime floor is **Node ≥ 20.11.0** (`fetch`, `AbortSignal.any()`/
  `.timeout()`, `import.meta.dirname`); tsup targets `node20.11`. Tests may
  run on newer Node but must not raise the runtime floor.
- Log to **stderr only** — stdout is the MCP protocol channel. Use the logger;
  it redacts credentials.
- Tool failures return `{ isError: true }` results (via `guard()` / `result.ts`),
  never thrown — the agent should get an actionable message. Mutation/personal
  tools are gated by `ctx.requireAuth()` (defined in `clients/anilist/context.ts`,
  implemented in `clients/anilist.ts`), called at the top of each domain
  function that needs it — it throws an actionable `ApiError` before any
  network call rather than making a doomed authenticated request.
- Write tool `description`s and per-field `.describe()` text for the calling
  model: explain when to use a tool and what each parameter means. Check new
  or edited descriptions against the `tool-description-check` skill (Glama's
  TDQS rubric) before committing.
- **Name a field for what it actually accepts, not a generic ID suffix** —
  e.g. `user` (accepts either a numeric AniList ID or an exact username, see
  `outputSchemas.ts`'s shared `userIdOrName`) rather than `user_id`/`userId`,
  which would wrongly imply numbers only. Keep the same field name for the
  same concept across every tool that takes it — grep sibling tools before
  naming a new field for an existing concept. A name that silently diverges
  (e.g. `search_activity`'s old `userId` vs every other user-scoped tool's
  `user`) isn't caught by schema validation (no schema in this codebase is
  `.strict()`) — the mismatched key is just dropped, and the tool silently
  falls back to whatever the field being absent means, instead of erroring
  (see `CHANGELOG.md` 0.2.2 for the bug this caused live).
- Every tool declares an `outputSchema` alongside `inputSchema`, describing the
  `structuredContent` shape `jsonResult()` returns. Model top-level keys
  precisely; for arrays of AniList media/character/staff/etc. objects and
  other deeply-nested GraphQL substructures, a loose `.loose()` shape is fine
  (`z.json()` for a field that's genuinely AniList's own untyped GraphQL
  `Json` scalar, e.g. `advancedScores`/`childComments`/`theme`) — the SDK
  validates `structuredContent` against `outputSchema` at runtime, so a
  schema that's too strict fails real tool calls (a good signal, not just a
  style nit — but verify a bound against live AniList data before adding it,
  the same way `anilistId`/`fuzzyDateOut`'s `.positive()` are documented as
  confirmed live; a plausible-sounding bound like "an episode number is
  always ≥1" can be wrong — AniList's `AiringSchedule.episode` does return
  `0` for some titles).
- **Never use `z.date()`/`z.bigint()`/`z.nan()`/`.transform()`/`z.map()`/
  `z.set()`/`z.symbol()`/`z.void()`/`z.custom()` in a tool's `inputSchema` or
  `outputSchema`.** `@modelcontextprotocol/server` v2 converts every
  registered schema to JSON Schema via Zod's own `~standard.jsonSchema`
  bridge (`node_modules/@modelcontextprotocol/server/dist/src-CX2iR2pK.mjs`,
  `standardSchemaToJsonSchema()`) with no `unrepresentable` override — and
  that bridge, like `z.toJSONSchema()` itself, defaults `unrepresentable` to
  `"throw"` (`zod/v4/core/to-json-schema.js`), not `"any"`. One of these
  types anywhere in a tool schema throws at `registerTool()` time — i.e. it
  crashes server startup, not just the one tool call. A reach for `z.date()`
  on a "since"-style parameter is the likely way this bites; use a
  date/time **string** format instead (e.g. `z.iso.datetime()`).
- Mocked-`fetch` test fixtures must mirror the real upstream response shape
  for that exact query, not just whatever fields make the current code
  pass — see the `fixture-accuracy-check` skill.
- **Schema-first for hand-built internal shapes** (config, persisted state —
  not GraphQL passthrough objects, which stay loose per the `outputSchema`
  rule above): when a type describes an object the code itself constructs
  from external input (env vars, an on-disk file, an OAuth response), define
  the Zod schema first and derive the type via `z.infer<typeof Schema>`, then
  build the value through `schema.parse()`/`.safeParse()`/`.transform()`
  rather than a hand-written `interface` kept in sync by convention with a
  separately-built object literal — see `Config`/`AniListAuth`
  (`config.ts`) and `TokenState` (`lib/tokenStore.ts`). This is a house style
  going forward, not (yet) retrofitted onto every existing hand-written
  interface over external input (e.g. `GraphQLResponse<T>` in
  `lib/graphql.ts` still isn't converted) — migrate an existing one
  opportunistically when you're already touching it, don't do a
  drive-by rewrite.
- Keep dependencies minimal. New deps need a clear justification (supply-chain).
- **Plain-JS tooling files** (`scripts/*.mjs`, `eslint.config.mjs`) still get
  type-checked — add `// @ts-check` + JSDoc annotations rather than leaving
  them untyped. They run directly via `node`/`eslint` (not through tsup), so
  they're checked via a separate `tsconfig.scripts.json` (`npm run
typecheck:scripts`, folded into `npm run lint`) instead of the main
  `tsconfig.json`, which only covers `src/`.
- **Never commit secrets.** Credentials come from env vars, the `login_anilist`
  OAuth flow, or the on-disk token store (`tokenStore.ts`, `0600`) — never
  hardcoded or committed. Unlike MAL, AniList issues a `client_secret` for
  every app (no "public vs confidential app type" pitfall) and does **not**
  support refresh tokens — access tokens are long-lived JWTs (~1 year);
  re-authentication via `login_anilist` is the only way to renew one.
- **MCP SDK**: this project runs on stable **`@modelcontextprotocol/server` v2**
  (`2.0.0`, pinned exact — not a `^range`) ahead of the sibling servers
  (`mal-mcp`/`tmdb-mcp`/`steam-games-mcp`, all still on v1). Re-run the full
  test suite, including `e2e.test.ts`, before merging any future SDK bump.
- **No `logging` MCP capability.** `notifications/message`/`logging/setLevel`
  were deprecated in protocol version 2026-07-28 (SEP-2577) in favor of
  stderr/OpenTelemetry — which `lib/logger.ts` already does (stderr-only,
  redacted). Don't re-add the capability; if a future need for structured
  client-visible logs comes up, look at whatever SEP-2577's eventual
  replacement is, not the deprecated push-style API. The same applies to
  sampling/elicitation/roots (also deprecated in that revision) — none of
  them are used here, and the deprecated push-style versions aren't worth
  building on.
- Cross-platform: macOS, Linux and Windows. Avoid POSIX-only shell in npm
  scripts (use the Node helper scripts).
- **Commits on this fork:** commits may use the authenticated GitHub user's
  identity or the author/committer identity supplied by the active GitHub
  connector/automation. Do **not** force the upstream maintainer identity
  `Grinv <4070730+Grinv@users.noreply.github.com>` for fork-specific work,
  and do **not** impersonate upstream authorship. Preserve original authorship
  on existing upstream commits. If preparing a contribution intended for
  upstream, follow the upstream repository's contribution requirements at that
  time. A `Co-Authored-By` trailer is optional only when it accurately
  reflects a real co-author; never add one automatically.
- **CodeQL** (`.github/workflows/codeql.yml`) scans `javascript-typescript` on
  push/PR to main plus a weekly cron — no local equivalent command; findings
  surface under the repo's **Security → Code scanning** tab.

## Testing the live/published server

For a full audit of the currently published (or just-fixed) package —
build/test/lint plus hammering the live MCP tools with edge cases,
cross-checked against source — follow
[.agents/skills/live-audit/SKILL.md](.agents/skills/live-audit/SKILL.md).
It covers the safety rules for testing mutation tools against a real
authenticated account, what edge cases to cover, and known bug classes
found in past passes worth checking don't recur.

## Before opening a PR

Run `npm run build && npm test && npm run lint && npm run format:check`.
Update `CHANGELOG.md` (Unreleased section) — see the `changelog-style` skill
for entry style.

## Releasing

`package.json` is the single source of truth for the version; `npm version`
bumps + syncs every derived file + tags the release. See the `release` skill
for the full steps (including the `preversion` gate on `CHANGELOG.md` and
tool descriptions) and MCP Registry details.

## Reuse / shared architecture

This server follows the same reusable shape as its siblings: a generic
carcass (`src/lib/` + build tooling, tests infra, CI) and a thin domain layer
(`config.ts`, `clients/`, domain `tools/`, `prompts.ts`, `check-api.mjs`),
bootstrapped from the **`mcp-server-template`** repository. Extract `lib/`
into a shared npm package only once cross-server duplication actually hurts
(YAGNI) — not before.
