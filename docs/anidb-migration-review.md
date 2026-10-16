# AniDB → AniList migration review policy

Migration planning was read-only, using a private normalized history bundle and independently verified AniList account state. A separate, explicitly approved writer later applied only strong completed-state candidates. Exact account snapshots, target lists, progress, approval phrases, fingerprinted personal history and migration outcome counts are maintained in the owner's private project notes.

## Conservative write rules

- Verify the authenticated target account and every media identity before any write.
- Never infer completion from file ownership or episode availability alone.
- Preserve current/updated list entries; avoid overwriting newer states.
- Map IDs deterministically before considering an explicitly reviewed fallback.
- Keep partial, unwatched and ambiguous history unchanged without direct owner approval.
- Do not infer personal scores from community ratings or invent watched dates.
- Verify every mutation by authenticated read-back, and retain failures privately.

These rules do not authorize replaying prior migration workflows. Historical revisions and public Actions logs may still contain earlier details; editing the current document is not retroactive redaction.
