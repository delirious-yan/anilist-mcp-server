# AniList MCP — public maintainer handoff

This public repository documents the AniList MCP **software**, not its maintainer's personal watch history.

## Development and execution

- GitHub is the canonical repository and review workspace. Changes should be reviewed and verified with CI.
- Runtime source and API tools are under `src/`. Generic integration documentation is under `docs/`.
- Public read-only AniList tools work without authentication. Write-capable tools require an individually authorized AniList user OAuth token; never put credentials in Git.
- The reusable, verified account-update workflow is [AniList single or batch sync](.github/workflows/anilist-single-entry-sync.yml), based on `anilist-requests/current.json`. See [sync instructions](docs/anilist-sync-workflow.md).
- Every account modification requires explicit approval, exact media-identity/status/progress preflight, authenticated readback, and verified Actions job evidence. Do not infer authorization from the existence of a secret, a request file, or prior successes.
- Do not create recurring or one-shot secret-bearing workflows to perform routine list updates. Retire temporary workflows after confirmed completion.
- For an independent MCP client, each user configures their own OAuth credentials. Public forks do not inherit repository secrets.

## Historical migration

AniDB-to-AniList import tooling remains in the source tree for study and controlled reuse. The historical import performed by the repository maintainer was completed under separately approved conservative rules. It is **not** an authorization for another import.

Generic engineering notes are in [migration design](docs/anidb-migration.md). Detailed historical watched states, private export findings, precise completed/partial counts, activity-setting decisions, personal mapping exceptions, and previous owner-specific reports are maintained privately by the owner, outside this public repository.

Never upload or commit raw AniDB exports, normalized private history bundles, access tokens, personal migration reports, scores or owner-preference reconstructions. Avoid printing individual authenticated list entries into public GitHub Actions logs, even when credential redaction succeeds.

## Current scope

- Preserve the reusable request-file sync path and normal tests.
- Prefer offline CI for external contributions; keep read-only GitHub permissions.
- Do not run migration, alter account history, publish a release, or modify credentials without explicit task-level authorization.
