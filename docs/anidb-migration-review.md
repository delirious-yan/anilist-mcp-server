# AniDB → AniList dry-run review

Status: **reviewed and completed-only policy approved; zero writes applied**

GitHub Actions run: `37466671602`

Target AniList account: `Luciedmeo`

## Dry-run result

The repo-hosted comparison completed successfully against the public AniList list.

- AniDB anime records: **208**
- Existing AniList entries: **5**
- Exact AniDB → AniList mappings: **196**
- High-confidence fallback mappings: **10**
- Curated one-to-many split mappings: **1**
- Curated no-op aggregate mappings: **1**
- Unresolved mappings: **0**
- AniList writes applied: **0**

Watch-state reconstruction:

- Completed: **132**
- Partial historical progress: **42**
- Unwatched: **14**
- Unknown/no episode evidence: **20**

Comparison outcome:

- Missing strong Completed candidates: **129**
- Existing AniList entries already Completed: **3**
- Historical partial-progress entries missing from AniList: **42**
- Unwatched/unknown historical entries with no justified write: **32**
- Curated ignored aggregate with no watched evidence: **1**
- Curated split Completed candidate: **1**

## Curated edge cases

### Gintama. (2017) — AniDB 13263

AniDB models the 2017 run as one 25-episode record. AniList models it as two entries:

- AniList **97889** — `Gintama.`, 12 episodes
- AniList **99714** — `Gintama.: Porori-hen`, 13 episodes

AniDB has strong watched evidence for all 25 episodes, so the dry-run proposes both AniList entries as `COMPLETED` with progress 12 and 13 respectively.

### Kara no Kyoukai aggregate — AniDB 4932

AniDB contains a seven-film aggregate while AniList models the films separately. The historical AniDB record has no watched evidence, so it is deliberately treated as a no-op. No AniList entry should be created from this aggregate automatically.

## Recommended write policy

The first write pass should be deliberately narrow:

1. Preserve every existing AniList entry exactly as-is.
2. Add only strong historical Completed candidates.
3. For the curated Gintama split, add/update the two AniList entries above as Completed.
4. Do **not** write the 42 partial-history entries in the first pass. Their historical progress is useful, but status cannot be inferred safely.
5. Do **not** create entries from unwatched or unknown AniDB ownership/history.
6. Do **not** migrate scores: the AniDB export rating is not a personal user score.
7. Do **not** write historical start/completion dates in the first pass. Some exported view timestamps look batch-like, so dates should remain preserved as evidence in the report rather than copied into AniList automatically.
8. No bulk write may run until the user explicitly approves this policy after seeing the dry-run review.

The initial source-record estimate was 131 actions. The dedicated write planner then
deduplicated completed historical evidence by AniList media ID and produced a
fingerprinted set of **132 unique Completed targets**. Against the reviewed
5-entry AniList snapshot, **130 unique missing AniList entries** remain to be
created.

Verified plan run: `37471359927`

- Completed target fingerprint: `66e27007ee4e4f7b663abe51e69ec097033a1af8fa52890e5fb951c168e6a953`
- Reviewed AniList snapshot fingerprint: `3e837325c9c11a0a61ffc2c89a947e1826d2a3b24383296eacc0fdda2fb86614`
- Write plan fingerprint: `9e67e9a289f194ba5b7c4cc882ab5047917abece4fac1262a0d63e7265b15f31`
- Approved exact confirmation phrase: `APPLY_COMPLETED_ONLY_130`
- Writes applied by the plan run: **0**

The user approved the completed-only migration policy on 2026-10-06.

The apply phase remains guarded: it verifies the authenticated account, all
reviewed counts/fingerprints, and the exact AniList snapshot before writing.
It probes each target immediately before mutation, preserves any entry that
already exists, verifies every created entry, and rolls back a newly-created
entry if verification fails.

## Refreshed executable baseline after interrupted apply attempts

A later guarded apply attempt detected that the AniList list had changed and
refused to write. A repo-hosted read-only refresh run then re-reviewed the
current state before continuing.

Refresh plan run: `37484756413`

- Current AniList entries: **27**
- Existing completed-history target entries: **24**
- Existing target mismatches: **0**
- Non-target AniList entries: **3**
- Remaining missing Completed targets: **108**
- Completed target fingerprint remains:
  `66e27007ee4e4f7b663abe51e69ec097033a1af8fa52890e5fb951c168e6a953`
- Refreshed AniList snapshot fingerprint:
  `0d31a07c448e671a569ea106b4b7e7658c485ff0f6d69d65aa239f77f3208f06`
- Refreshed remaining-write fingerprint:
  `2f7125acdb1053773180b21fa1c1962402890d84f181584859eb0f27130ea617`
- New exact confirmation phrase: `APPLY_COMPLETED_ONLY_108`

The refresh confirmed that every already-present completed-history target matches
the approved Completed status/progress. No corrective overwrite is required.
The user selected **suppressed COMPLETED activity** for the remaining apply pass.
