# Repo-only AniDB → AniList migration

This fork uses GitHub as the sole project workspace. The migration must not depend
on a local checkout, local Node.js, local Claude Code, or a localhost OAuth
callback.

## Private AniDB input

The two AniDB exports are normalized outside the public repository into one
compact history bundle containing only the fields needed by the dry-run:

- AniDB anime ID
- titles/type/year
- total/owned/watched normal-episode counts
- first/last watched timestamps and dates when available
- reconstructed conservative watch state

The raw AniDB archives are **not** committed.

The normalized bundle is gzip-compressed and base64 encoded, then stored as the
GitHub Actions repository secret:

`ANIDB_HISTORY_BUNDLE_B64`

The workflow refuses to run without that secret.

## Repo-hosted dry-run

Workflow:

`.github/workflows/anidb-dry-run.yml`

It:

1. checks out the PR branch on a GitHub-hosted runner;
2. builds the repository;
3. decodes `ANIDB_HISTORY_BUNDLE_B64` only into the runner's temporary directory;
4. runs `dist/anidb-migration.js --history-bundle ...`;
5. compares against the public AniList list for `Luciedmeo`;
6. makes **zero AniList mutations**;
7. encrypts the detailed JSON report;
8. uploads only the encrypted report as a short-lived Actions artifact;
9. deletes the plaintext private input/report from the runner.

The workflow log exposes aggregate counts only. It does not print the detailed
title-by-title report.

The report encryption passphrase is derived from the private history bundle
secret, so the public repository never stores a separate decryption key.

## Mapping determinism

Fallback AniDB → AniList matching is intentionally performed **without** the
AniList access token, even during an authenticated apply run. This preserves the
same public-search mapping set that was reviewed and fingerprinted during the
dry-run.

The access token is used only for account verification, authenticated current
list reads, activity-preference handling, and mutations. This separation prevents
AniList account visibility/preferences from changing the approved fallback
mapping set during a write run.

## AniList authentication

Authentication is **not required for the first dry-run** because
`Luciedmeo`'s public anime list can be read without credentials.

If a later approved write phase needs authentication, do not reintroduce a
localhost requirement. Use AniList's browser-based implicit/Auth Pin flow and
store the resulting token as the GitHub Actions repository secret:

`ANILIST_ACCESS_TOKEN`

For that flow, the AniList developer client redirect should be
`https://anilist.co/api/v2/oauth/pin`.

Never commit the access token, Client Secret, raw AniDB exports, normalized
history bundle, or plaintext migration report.

## Current execution gate

Before rerunning the repo-hosted dry-run, configure only:

`ANIDB_HISTORY_BUNDLE_B64`

under **Repository Settings → Secrets and variables → Actions**.

After the secret exists, the already-created failed workflow run can be rerun;
no local command or checkout is required.
