# Historical migration review — general principles

The historical owner-specific migration review and individual result data have been archived privately and deliberately omitted from the public documentation.

A safe AniDB-to-AniList migration review should check:

1. The data subject's authorization and authenticated target account.
2. Deterministic mapping for exact IDs, with human review of ambiguous fallbacks.
3. A distinction between *owned*, *watched*, *partially watched* and *unknown* states.
4. Current AniList records before making changes; do not replace newer information with historical estimates.
5. Compatibility between reliably watched episode counts and the target series' episode count.
6. Small, explicit, idempotent writes with authenticated readback and rollback or reconciliation procedures.
7. Account-preference restoration, private report retention, and complete plaintext cleanup.

Never publish identifiable histories, private migration datasets, detailed reports, scores, or account settings in public source or GitHub Actions logs. This document is not a request to rerun a completed migration.
