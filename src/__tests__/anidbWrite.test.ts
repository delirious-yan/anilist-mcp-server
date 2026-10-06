import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompletedOnlyWritePlan } from "../importers/anidbWrite.js";
import {
  completedTargetFingerprint,
  currentListSnapshotFingerprint,
} from "../importers/anidbRuntime.js";

test("completed-only write plan preserves every existing AniList entry", () => {
  const targets = [
    { anidbId: 1, anilistId: 101, progress: 12, mappingSource: "exact" as const },
    { anidbId: 2, anilistId: 102, progress: 24, mappingSource: "fallback" as const },
  ];
  const currentList = [
    {
      entryId: 9001,
      mediaId: 101,
      status: "PLANNING",
      progress: 0,
      score: 8,
      title: "Existing target",
    },
    {
      entryId: 9002,
      mediaId: 999,
      status: "CURRENT",
      progress: 3,
      title: "Unrelated",
    },
  ];

  const plan = buildCompletedOnlyWritePlan(targets, currentList);

  assert.deepEqual(plan.actions, [targets[1]]);
  assert.deepEqual(plan.existingTargetEntries, [currentList[0]]);
  assert.deepEqual(plan.nonTargetEntries, [currentList[1]]);
});

test("current AniList snapshot fingerprint is order-independent", () => {
  const list = [
    {
      entryId: 1,
      mediaId: 20,
      status: "CURRENT",
      progress: 4,
      score: 7.5,
      title: "B",
    },
    {
      entryId: 2,
      mediaId: 10,
      status: "COMPLETED",
      progress: 12,
      title: "A",
    },
  ];
  assert.equal(
    currentListSnapshotFingerprint(list),
    currentListSnapshotFingerprint([...list].reverse()),
  );
});

test("completed target fingerprint changes when approved progress changes", () => {
  const base = [{ anidbId: 1, anilistId: 101, progress: 12, mappingSource: "exact" as const }];
  const changed = [{ ...base[0]!, progress: 11 }];

  assert.notEqual(completedTargetFingerprint(base), completedTargetFingerprint(changed));
});
