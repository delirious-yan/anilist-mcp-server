# AniDB → AniList completed-only migration

The historical completed-only import concluded after authenticated validation and read-back. The migration used conservative episode-count verification and skipped entries where available viewing evidence did not justify `COMPLETED` status. Private account-specific statistics, historical progress, identity details and execution notes are retained exclusively in the owner-controlled private project handoff, not in this public repository's current documentation.

This document is an engineering reference, **not an authorization to repeat the migration**. No migration job should run without new, explicit authorization and current-state preflight. Older versions of this file and associated public GitHub Actions logs may remain accessible in repository history.
