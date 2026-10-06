import { z } from "zod";
import type { AniListListEntry, CompletedHistoricalTarget } from "./anidb.js";

const FuzzyDateSchema = z
  .object({
    year: z.number().int().nullish(),
    month: z.number().int().nullish(),
    day: z.number().int().nullish(),
  })
  .nullish();

const ProbedEntrySchema = z
  .object({
    id: z.number().int().positive(),
    status: z.string().nullish(),
    progress: z.number().int().nonnegative().nullish(),
    startedAt: FuzzyDateSchema,
    completedAt: FuzzyDateSchema,
  })
  .loose();

const ProbeResponseSchema = z
  .object({
    Media: z
      .object({
        // AniList returns null here when the authenticated user has no list
        // entry for the media. That is the normal precondition for a create.
        mediaListEntry: ProbedEntrySchema.nullish(),
      })
      .nullish(),
  })
  .loose();

export type ProbedListEntry = z.infer<typeof ProbedEntrySchema>;

export function parseProbedListEntry(data: unknown): ProbedListEntry | null {
  return ProbeResponseSchema.parse(data).Media?.mediaListEntry ?? null;
}

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
