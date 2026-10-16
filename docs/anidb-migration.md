# AniDB-to-AniList migration design (generic)

This document describes a conservative migration architecture for any user who explicitly authorizes migrating their own data. **No personal history, account-specific plan, or live migration is included in this public document.**

## Inputs and identity

- Exported AniDB library metadata alone does not prove that an episode was watched.
- If available, pair library metadata with reliable per-episode watched-state evidence (such as timestamps) before inferring progress or completion.
- Normalize media identities using exact source and target IDs where possible; apply reviewable deterministic fallback mapping when identifiers are missing. Ambiguous cases require human review.
- Never treat AniDB community ratings as a user's personal AniList score.

## Safe phases

1. Validate inputs and data ownership. Keep raw exports and normalized personal histories outside public Git history.
2. Compute deterministic, read-only mappings and an offline proposal. Produce a private, access-controlled report.
3. Check the target user's current AniList list. Preserve any newer/current information and prevent accidental overwrites.
4. Obtain distinct explicit authorization for the reviewed mutation set.
5. For any approved write, authenticate the target account, validate media identity and expected episode count, apply the smallest necessary change, and read back.
6. Restore any temporarily changed account preferences, verify restoration, and delete plaintext temporary files.

## Secrets and reporting

Never include source exports, normalized history bundles, OAuth tokens, identifiable personal activity, scores, or detailed per-entry reports in code, public issues, pull requests, workflow logs, or artifacts. Securely store required secrets outside source. Tests should use synthetic fixtures and mocked responses.

This repository's historical owner-specific migration is complete and is not a recommended routine workflow. The reusable [single/batch AniList sync](anilist-sync-workflow.md) is the correct mechanism for separately authorized small list changes.
