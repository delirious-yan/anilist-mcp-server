# AniDB → AniList dry-run review

Status: **reviewed, zero writes applied**

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

Under this policy, the first write pass would propose:

- **129** ordinary missing Completed entries
- **2** Completed AniList entries from the Gintama one-to-many split
- **131 total new/update actions**, subject to a fresh pre-write comparison

The write phase must re-fetch the AniList list immediately before mutations and skip any entry whose current AniList state has changed since this dry-run.
