import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AniListClient } from "../clients/anilist.js";
import { getUserList } from "../clients/anilist/list.js";
import { searchMedia } from "../clients/anilist/search.js";
import {
  applyCuratedMappingOverrides,
  buildCompletedHistoricalTargets,
  chooseFallbackMatch,
  exactMappings,
  parseCompactAniListRows,
  parseIdMappings,
  parseSearchCandidates,
  type AniDbHistory,
  type AniListListEntry,
  type CompletedHistoricalTarget,
  type ResolvedMapping,
} from "./anidb.js";

export const DEFAULT_MAPPING_URL =
  "https://raw.githubusercontent.com/anime-and-manga/lists/06a316a574937d009a4dd2db65a4d0972d53c2de/anime.json";

export async function loadMappings(mappingFile: string | undefined, mappingUrl: string) {
  if (mappingFile) {
    return parseIdMappings(JSON.parse(readFileSync(mappingFile, "utf8")) as unknown);
  }

  const response = await fetch(mappingUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Mapping download failed: HTTP ${response.status}`);
  return parseIdMappings(await response.json());
}

export async function fetchWholeAnimeList(
  client: AniListClient,
  user: string,
): Promise<AniListListEntry[]> {
  const rows: string[] = [];
  let chunk = 1;
  for (;;) {
    const result = await getUserList(client.ctx(), "ANIME", user, {
      format: "compact",
      chunk,
      perChunk: 5000,
    });
    if (result.format !== "compact") throw new Error("Expected compact AniList response");
    if (result.rows) rows.push(result.rows);
    if (!result.hasNextChunk) break;
    chunk += 1;
  }
  return parseCompactAniListRows(rows.join("\n"));
}

async function resolveFallbackMappings(
  client: AniListClient,
  history: AniDbHistory[],
  mappings: ResolvedMapping[],
): Promise<ResolvedMapping[]> {
  const historyById = new Map(history.map((item) => [item.anidbId, item]));
  const resolved: ResolvedMapping[] = [];

  for (const mapping of mappings) {
    if (mapping.anilistId) {
      resolved.push(mapping);
      continue;
    }

    const item = historyById.get(mapping.anidbId);
    if (!item) {
      resolved.push(mapping);
      continue;
    }

    const term = item.englishTitle || item.title;
    const page = await searchMedia(client.ctx(), "ANIME", { term, perPage: 5 });
    const choice = chooseFallbackMatch(item, parseSearchCandidates(page));

    if (choice.match) {
      resolved.push({
        anidbId: item.anidbId,
        anilistId: choice.match.id,
        source: "fallback",
        confidence: choice.match.score,
        candidates: choice.candidates,
      });
    } else {
      resolved.push({
        anidbId: item.anidbId,
        source: "unresolved",
        candidates: choice.candidates,
      });
    }
  }

  return resolved;
}

export async function resolveMigrationMappings(
  client: AniListClient,
  history: AniDbHistory[],
  options: {
    mappingFile?: string;
    mappingUrl?: string;
    skipFallback?: boolean;
  } = {},
): Promise<ResolvedMapping[]> {
  const mappingUrl = options.mappingUrl ?? DEFAULT_MAPPING_URL;
  const mappingData = await loadMappings(options.mappingFile, mappingUrl);
  let mappings = exactMappings(history, mappingData);
  if (!options.skipFallback) {
    mappings = await resolveFallbackMappings(client, history, mappings);
  }
  return applyCuratedMappingOverrides(mappings);
}

export function completedTargetFingerprint(targets: CompletedHistoricalTarget[]): string {
  return createHash("sha256")
    .update(targets.map((item) => `${item.anilistId}:${item.progress}`).join("\n"))
    .digest("hex");
}

export function missingCompletedTargets(
  targets: CompletedHistoricalTarget[],
  currentList: AniListListEntry[],
): CompletedHistoricalTarget[] {
  const currentMediaIds = new Set(currentList.map((entry) => entry.mediaId));
  return targets.filter((target) => !currentMediaIds.has(target.anilistId));
}

export function currentListSnapshotFingerprint(currentList: AniListListEntry[]): string {
  const canonical = [...currentList]
    .sort((a, b) => a.mediaId - b.mediaId)
    .map((entry) => `${entry.mediaId}:${entry.status ?? ""}:${entry.progress}:${entry.score ?? ""}`)
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

export function completedTargetsAndFingerprint(
  history: AniDbHistory[],
  mappings: ResolvedMapping[],
): { targets: CompletedHistoricalTarget[]; fingerprint: string } {
  const targets = buildCompletedHistoricalTargets(history, mappings);
  return { targets, fingerprint: completedTargetFingerprint(targets) };
}

export function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}
