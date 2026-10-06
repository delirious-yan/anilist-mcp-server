import type {
  AniListListEntry,
  CompletedHistoricalTarget,
} from "./anidb.js";

export interface CompletedOnlyWritePlan {
  targets: CompletedHistoricalTarget[];
  actions: CompletedHistoricalTarget[];
  existingTargetEntries: AniListListEntry[];
  nonTargetEntries: AniListListEntry[];
}

export function buildCompletedOnlyWritePlan(
  targets: CompletedHistoricalTarget[],
  currentList: AniListListEntry[],
): CompletedOnlyWritePlan {
  const targetByMediaId = new Map(targets.map((target) => [target.anilistId, target]));
  const currentByMediaId = new Map(currentList.map((entry) => [entry.mediaId, entry]));

  const actions = targets.filter((target) => !currentByMediaId.has(target.anilistId));
  const existingTargetEntries = currentList.filter((entry) => targetByMediaId.has(entry.mediaId));
  const nonTargetEntries = currentList.filter((entry) => !targetByMediaId.has(entry.mediaId));

  return {
    targets,
    actions,
    existingTargetEntries,
    nonTargetEntries,
  };
}
