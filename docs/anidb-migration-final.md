# AniDB → AniList completed-only migration final record

## Outcome

The approved completed-only historical migration for AniList user
`Luciedmeo` is complete.

Final verified state:

- Historical Completed targets: **132**
- Completed targets present and matching on AniList: **130**
- Remaining conservative exclusions: **2**
- Target mismatches after migration: **0**
- Partial-history entries intentionally untouched: **42**
- Unwatched/unknown historical entries intentionally untouched: **34**
- Scores imported: **0**
- Historical dates imported: **0**

## Execution history

The first authorized apply, run `37555042109`, created **58** approved entries
before AniList rejected the expected Completed progress for the next target.
That attempted target was rolled back, and both Completed-feed suppression and
the temporary adult-content preference were restored and verified.

Read-only diagnostics then identified two episode-model incompatibilities:

| AniDB | AniList | Historical watched progress | AniList episodes | Decision                                   |
| ----: | ------: | --------------------------: | ---------------: | ------------------------------------------ |
|  5406 |    2966 |                          12 |               13 | Exclude from automatic Completed migration |
|  6327 |    5081 |                          12 |               15 | Exclude from automatic Completed migration |

Run `37557510964` then applied the remaining **48 compatible** Completed
entries successfully.

During that run:

- Completed list activity was suppressed.
- Adult-content visibility was temporarily enabled.
- The five previously hidden adult-only targets were preflighted successfully.
- All 48 compatible writes were verified.
- Completed activity preferences were restored and verified.
- Adult-content visibility was restored to its original value and verified.

## Final verification

Read-only run `37564331110` verified:

- Total AniList entries with temporary adult visibility: **133**
- Historical Completed target entries present: **130**
- Historical Completed target mismatches: **0**
- Remaining actions: **2**
- Compatible remaining actions: **0**
- Remaining actions are exactly AniList media `2966` and `5081`
- Original adult-content visibility is `false` and was restored successfully

## Why the two exclusions remain

The migration policy requires historical evidence to support every Completed
entry. For the two remaining mappings, AniList models more episodes than the
AniDB watched evidence proves.

Automatically marking either title Completed would therefore claim watched
episodes that are not established by the historical source. The migration leaves
both entries untouched rather than guessing.

Any later decision for those two records must be separately reviewed and
explicitly approved.

## What remains outside this phase

The **42 partial-history** entries were never part of the approved completed-only
write pass. They remain available for a future migration phase where progress and
status can be reviewed title by title without inferring `CURRENT`, `DROPPED`,
or `COMPLETED` from incomplete evidence.
