import { z } from "zod";

const JsonEpisodeSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    number: z.string().min(1),
  })
  .loose();

const JsonAnimeSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    broadcastDate: z.string().optional().default(""),
    type: z.string().optional().default(""),
    status: z.string().optional().default(""),
    totalEpisodes: z.coerce.number().int().nonnegative().optional().default(0),
    ownEpisodes: z.coerce.number().int().nonnegative().optional().default(0),
    romanjiName: z.string().optional().default(""),
    englishName: z.string().optional().default(""),
    episodes: z.array(JsonEpisodeSchema).optional().default([]),
  })
  .loose();

const JsonLargeSchema = z.object({ anime: z.array(JsonAnimeSchema) }).loose();

const MappingSchema = z
  .object({
    idAniDB: z.coerce.number().int().nonnegative(),
    idAL: z.coerce.number().int().positive(),
    idMal: z.coerce.number().int().positive().nullish(),
  })
  .loose();
const MappingListSchema = z.array(MappingSchema);

const SearchCandidateSchema = z
  .object({
    id: z.number().int().positive(),
    idMal: z.number().int().positive().nullish(),
    format: z.string().nullish(),
    episodes: z.number().int().nonnegative().nullish(),
    startDate: z
      .object({
        year: z.number().int().positive().nullish(),
        month: z.number().int().positive().nullish(),
        day: z.number().int().positive().nullish(),
      })
      .nullish(),
    title: z
      .object({
        romaji: z.string().nullish(),
        english: z.string().nullish(),
        native: z.string().nullish(),
      })
      .nullish(),
  })
  .loose();
const SearchPageSchema = z.object({ media: z.array(SearchCandidateSchema).nullish() }).loose();

export type AniDbJsonAnime = z.infer<typeof JsonAnimeSchema>;
export type IdMapping = z.infer<typeof MappingSchema>;
export type SearchCandidate = z.infer<typeof SearchCandidateSchema>;

export interface UdpMyListRecord {
  lid: number;
  fid: number;
  eid: number;
  aid: number;
  gid: number;
  addedAt: number;
  state: number;
  viewedAt: number;
}

export interface FuzzyDate {
  year: number;
  month: number;
  day: number;
}

export interface AniDbHistory {
  anidbId: number;
  title: string;
  englishTitle?: string;
  type: string;
  year?: number;
  totalEpisodes: number;
  ownedNormalEpisodes: number;
  watchedNormalEpisodes: number;
  firstViewedAt?: number;
  lastViewedAt?: number;
  firstViewedDate?: FuzzyDate;
  lastViewedDate?: FuzzyDate;
  fullyWatched: boolean;
  allOwnedNormalWatched: boolean;
  watchState: "completed" | "partial" | "unwatched" | "unknown";
}

const FuzzyDateSchema = z.object({
  year: z.number().int().positive(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});

const AniDbHistorySchema = z.object({
  anidbId: z.number().int().positive(),
  title: z.string().min(1),
  englishTitle: z.string().min(1).nullish(),
  type: z.string(),
  year: z.number().int().positive().nullish(),
  totalEpisodes: z.number().int().nonnegative(),
  ownedNormalEpisodes: z.number().int().nonnegative(),
  watchedNormalEpisodes: z.number().int().nonnegative(),
  firstViewedAt: z.number().int().positive().nullish(),
  lastViewedAt: z.number().int().positive().nullish(),
  firstViewedDate: FuzzyDateSchema.nullish(),
  lastViewedDate: FuzzyDateSchema.nullish(),
  fullyWatched: z.boolean(),
  allOwnedNormalWatched: z.boolean(),
  watchState: z.enum(["completed", "partial", "unwatched", "unknown"]),
});

const AniDbHistoryBundleSchema = z.object({
  version: z.literal(1),
  source: z.string().optional(),
  anime: z.array(AniDbHistorySchema),
});

export interface FallbackCandidate {
  id: number;
  score: number;
  title: string;
  year?: number;
  format?: string;
  episodes?: number;
}

export interface SplitMappingPart {
  anilistId: number;
  episodes: number;
}

export interface ResolvedMapping {
  anidbId: number;
  anilistId?: number;
  splitParts?: SplitMappingPart[];
  source: "exact" | "fallback" | "split" | "ignored" | "unresolved";
  confidence?: number;
  candidates?: FallbackCandidate[];
  note?: string;
}

export interface AniListListEntry {
  entryId: number;
  mediaId: number;
  idMal?: number;
  status?: string;
  score?: number;
  progress: number;
  title: string;
}

export interface CompletedHistoricalTarget {
  anidbId: number;
  anilistId: number;
  progress: number;
  mappingSource: ResolvedMapping["source"];
}

export interface MigrationComparison {
  anidbId: number;
  anilistId?: number;
  anilistIds?: number[];
  title: string;
  mappingSource: ResolvedMapping["source"];
  watchState: AniDbHistory["watchState"];
  aniDbProgress: number;
  aniDbTotalEpisodes: number;
  aniListStatus?: string;
  aniListProgress?: number;
  category:
    | "unresolved_mapping"
    | "ignored_no_watch_evidence"
    | "split_completed_candidate"
    | "missing_completed_candidate"
    | "missing_partial_history"
    | "missing_unwatched_history"
    | "already_completed"
    | "anilist_ahead"
    | "historical_progress_stronger"
    | "completion_conflict"
    | "same_or_equivalent";
  proposedChange?: {
    status?: "COMPLETED";
    progress?: number;
    startedAt?: FuzzyDate;
    completedAt?: FuzzyDate;
  };
  proposedSplitChanges?: Array<{
    anilistId: number;
    status: "COMPLETED";
    progress: number;
  }>;
  note: string;
}

function parseNonNegativeInt(value: string, field: string, lineNumber: number): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${field} on UDP MyList line ${lineNumber}: ${value}`);
  }
  return Number(value);
}

function isNormalEpisodeNumber(number: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(number.trim());
}

function yearFromBroadcastDate(value: string): number | undefined {
  const match = value.match(/(\d{4})(?!.*\d)/);
  return match ? Number(match[1]) : undefined;
}

function unixToFuzzyDate(seconds: number | undefined): FuzzyDate | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return undefined;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function parseJsonLarge(text: string): AniDbJsonAnime[] {
  // AniDB's json-large template can emit a backslash before a literal backtick
  // (e.g. Shin\`yaku), which is not a legal JSON escape. Repair only that
  // known exporter quirk instead of broadly rewriting escape sequences.
  const repaired = text.replace(/\\`/g, "`");
  let raw: unknown;
  try {
    raw = JSON.parse(repaired);
  } catch (error) {
    throw new Error(
      `Could not parse AniDB json-large export: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return JsonLargeSchema.parse(raw).anime;
}

export function parseUdpMyList(text: string): UdpMyListRecord[] {
  const records: UdpMyListRecord[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (rawLine === undefined) continue;
    const line = rawLine.trim();
    if (!/^\d+\|/.test(line)) continue;
    const fields = line.split("|");
    if (fields.length < 8) throw new Error(`Malformed UDP MyList record on line ${index + 1}`);
    const field = (position: number): string => {
      const value = fields[position];
      if (value === undefined) {
        throw new Error(`Malformed UDP MyList record on line ${index + 1}`);
      }
      return value;
    };

    records.push({
      lid: parseNonNegativeInt(field(0), "lid", index + 1),
      fid: parseNonNegativeInt(field(1), "fid", index + 1),
      eid: parseNonNegativeInt(field(2), "eid", index + 1),
      aid: parseNonNegativeInt(field(3), "aid", index + 1),
      gid: parseNonNegativeInt(field(4), "gid", index + 1),
      addedAt: parseNonNegativeInt(field(5), "date", index + 1),
      state: parseNonNegativeInt(field(6), "state", index + 1),
      viewedAt: parseNonNegativeInt(field(7), "viewdate", index + 1),
    });
  }
  return records;
}

export function buildAniDbHistory(
  anime: AniDbJsonAnime[],
  udpRecords: UdpMyListRecord[],
): AniDbHistory[] {
  const viewedByEpisode = new Map<number, number[]>();
  for (const record of udpRecords) {
    if (record.viewedAt <= 0) continue;
    const dates = viewedByEpisode.get(record.eid) ?? [];
    dates.push(record.viewedAt);
    viewedByEpisode.set(record.eid, dates);
  }

  return anime.map((item) => {
    const normalEpisodes = item.episodes.filter((episode) => isNormalEpisodeNumber(episode.number));
    const uniqueOwned = new Map(normalEpisodes.map((episode) => [episode.id, episode]));
    const watchedDates: number[] = [];
    for (const episodeId of uniqueOwned.keys()) {
      const dates = viewedByEpisode.get(episodeId);
      if (dates?.length) watchedDates.push(Math.min(...dates));
    }

    const watchedNormalEpisodes = watchedDates.length;
    const ownedNormalEpisodes = uniqueOwned.size || item.ownEpisodes;
    const fullyWatched =
      item.totalEpisodes > 0 &&
      ownedNormalEpisodes >= item.totalEpisodes &&
      watchedNormalEpisodes >= item.totalEpisodes;
    const allOwnedNormalWatched =
      ownedNormalEpisodes > 0 && watchedNormalEpisodes >= ownedNormalEpisodes;

    let watchState: AniDbHistory["watchState"] = "unknown";
    if (fullyWatched) watchState = "completed";
    else if (watchedNormalEpisodes > 0) watchState = "partial";
    else if (ownedNormalEpisodes > 0) watchState = "unwatched";

    const firstViewedAt = watchedDates.length ? Math.min(...watchedDates) : undefined;
    const lastViewedAt = watchedDates.length ? Math.max(...watchedDates) : undefined;

    return {
      anidbId: item.id,
      title: item.romanjiName || item.englishName || `AniDB ${item.id}`,
      englishTitle: item.englishName || undefined,
      type: item.type,
      year: yearFromBroadcastDate(item.broadcastDate),
      totalEpisodes: item.totalEpisodes,
      ownedNormalEpisodes,
      watchedNormalEpisodes,
      firstViewedAt,
      lastViewedAt,
      firstViewedDate: unixToFuzzyDate(firstViewedAt),
      lastViewedDate: unixToFuzzyDate(lastViewedAt),
      fullyWatched,
      allOwnedNormalWatched,
      watchState,
    };
  });
}

export function parseHistoryBundle(value: unknown): AniDbHistory[] {
  return AniDbHistoryBundleSchema.parse(value).anime.map((item) => ({
    ...item,
    englishTitle: item.englishTitle ?? undefined,
    year: item.year ?? undefined,
    firstViewedAt: item.firstViewedAt ?? undefined,
    lastViewedAt: item.lastViewedAt ?? undefined,
    firstViewedDate: item.firstViewedDate ?? undefined,
    lastViewedDate: item.lastViewedDate ?? undefined,
  }));
}

export function parseIdMappings(value: unknown): IdMapping[] {
  return MappingListSchema.parse(value).filter((mapping) => mapping.idAniDB > 0);
}

export function exactMappings(history: AniDbHistory[], mappings: IdMapping[]): ResolvedMapping[] {
  const byAniDb = new Map<number, Set<number>>();
  for (const mapping of mappings) {
    const ids = byAniDb.get(mapping.idAniDB) ?? new Set<number>();
    ids.add(mapping.idAL);
    byAniDb.set(mapping.idAniDB, ids);
  }
  return history.map((item) => {
    const ids = [...(byAniDb.get(item.anidbId) ?? [])];
    if (ids.length === 1) return { anidbId: item.anidbId, anilistId: ids[0], source: "exact" };
    return { anidbId: item.anidbId, source: "unresolved" };
  });
}

export function applyCuratedMappingOverrides(mappings: ResolvedMapping[]): ResolvedMapping[] {
  return mappings.map((mapping) => {
    // AniDB 13263 combines both 2017 TV cours into one 25-episode record.
    // AniList splits them into Gintama. (12 eps, AL 97889) and
    // Gintama.: Porori-hen (13 eps, AL 99714).
    if (mapping.anidbId === 13263) {
      return {
        anidbId: mapping.anidbId,
        source: "split",
        splitParts: [
          { anilistId: 97889, episodes: 12 },
          { anilistId: 99714, episodes: 13 },
        ],
        confidence: 15,
        note: "Curated one-to-many split for AniDB's combined 2017 Gintama entry.",
      };
    }

    // AniDB 4932 is a seven-film Kara no Kyoukai aggregate while AniList
    // models the films separately. This historical record carries no watched
    // evidence, so the safe migration action is to leave it untouched.
    if (mapping.anidbId === 4932) {
      return {
        anidbId: mapping.anidbId,
        source: "ignored",
        note: "Aggregate entry with no watched evidence; no AniList write is justified.",
      };
    }

    return mapping;
  });
}

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function aniDbTypeToAniListFormat(type: string): string | undefined {
  switch (type.trim().toLowerCase()) {
    case "tv series":
      return "TV";
    case "tv special":
      return "SPECIAL";
    case "ova":
      return "OVA";
    case "movie":
      return "MOVIE";
    case "web":
      return "ONA";
    case "music video":
      return "MUSIC";
    default:
      return undefined;
  }
}

export function parseSearchCandidates(page: unknown): SearchCandidate[] {
  return SearchPageSchema.parse(page).media ?? [];
}

export function chooseFallbackMatch(
  history: AniDbHistory,
  candidates: SearchCandidate[],
): { match?: FallbackCandidate; candidates: FallbackCandidate[] } {
  const expectedTitles = new Set(
    [history.title, history.englishTitle].map(normalizeTitle).filter(Boolean),
  );
  const expectedFormat = aniDbTypeToAniListFormat(history.type);

  const scored = candidates
    .map((candidate) => {
      const titles = [
        candidate.title?.romaji,
        candidate.title?.english,
        candidate.title?.native,
      ].filter((title): title is string => Boolean(title));
      const normalized = titles.map(normalizeTitle);
      const exactTitle = normalized.some((title) => expectedTitles.has(title));
      const partialTitle = normalized.some((title) =>
        [...expectedTitles].some(
          (expected) =>
            Boolean(expected) &&
            Boolean(title) &&
            (title.includes(expected) || expected.includes(title)),
        ),
      );

      let score = exactTitle ? 8 : partialTitle ? 4 : 0;
      const candidateYear = candidate.startDate?.year ?? undefined;
      if (history.year && candidateYear === history.year) score += 3;
      else if (history.year && candidateYear && Math.abs(candidateYear - history.year) === 1)
        score += 1;
      if (expectedFormat && candidate.format === expectedFormat) score += 2;
      if (
        history.totalEpisodes > 0 &&
        candidate.episodes &&
        candidate.episodes === history.totalEpisodes
      )
        score += 2;

      return {
        id: candidate.id,
        score,
        title:
          candidate.title?.english ??
          candidate.title?.romaji ??
          candidate.title?.native ??
          `AniList ${candidate.id}`,
        year: candidateYear,
        format: candidate.format ?? undefined,
        episodes: candidate.episodes ?? undefined,
      } satisfies FallbackCandidate;
    })
    .sort((a, b) => b.score - a.score || a.id - b.id);

  const best = scored[0];
  const second = scored[1];
  const uniqueEnough = best && best.score >= 10 && (!second || best.score - second.score >= 3);
  return { match: uniqueEnough ? best : undefined, candidates: scored.slice(0, 5) };
}

export function parseCompactAniListRows(rows: string): AniListListEntry[] {
  if (!rows.trim()) return [];
  return rows.split(/\r?\n/).map((row, index) => {
    const cells = row.split("\t");
    if (cells.length < 7) throw new Error(`Malformed AniList compact row ${index + 1}`);
    return {
      entryId: Number(cells[0]),
      mediaId: Number(cells[1]),
      idMal: cells[2] ? Number(cells[2]) : undefined,
      status: cells[3] || undefined,
      score: cells[4] ? Number(cells[4]) : undefined,
      progress: cells[5] ? Number(cells[5]) : 0,
      title: cells.slice(6).join("\t"),
    };
  });
}

export function buildCompletedHistoricalTargets(
  history: AniDbHistory[],
  resolved: ResolvedMapping[],
): CompletedHistoricalTarget[] {
  const mappingByAniDb = new Map(resolved.map((item) => [item.anidbId, item]));
  const byMediaId = new Map<number, CompletedHistoricalTarget>();

  for (const item of history) {
    if (item.watchState !== "completed") continue;
    const mapping = mappingByAniDb.get(item.anidbId);
    if (!mapping || mapping.source === "ignored" || mapping.source === "unresolved") continue;

    const candidates =
      mapping.source === "split"
        ? (mapping.splitParts ?? []).map((part) => ({
            anidbId: item.anidbId,
            anilistId: part.anilistId,
            progress: part.episodes,
            mappingSource: mapping.source,
          }))
        : mapping.anilistId
          ? [
              {
                anidbId: item.anidbId,
                anilistId: mapping.anilistId,
                progress: item.totalEpisodes || item.watchedNormalEpisodes,
                mappingSource: mapping.source,
              },
            ]
          : [];

    for (const candidate of candidates) {
      const existing = byMediaId.get(candidate.anilistId);
      if (
        existing &&
        (existing.progress !== candidate.progress || existing.anidbId !== candidate.anidbId)
      ) {
        throw new Error(
          `Conflicting completed-history targets for AniList media ${candidate.anilistId}`,
        );
      }
      byMediaId.set(candidate.anilistId, candidate);
    }
  }

  return [...byMediaId.values()].sort((a, b) => a.anilistId - b.anilistId);
}

export function compareMigration(
  history: AniDbHistory[],
  resolved: ResolvedMapping[],
  currentList: AniListListEntry[],
): MigrationComparison[] {
  const mappingByAniDb = new Map(resolved.map((item) => [item.anidbId, item]));
  const currentByMedia = new Map(currentList.map((entry) => [entry.mediaId, entry]));

  return history.map((item) => {
    const mapping = mappingByAniDb.get(item.anidbId);

    if (mapping?.source === "ignored") {
      return {
        anidbId: item.anidbId,
        title: item.title,
        mappingSource: mapping.source,
        watchState: item.watchState,
        aniDbProgress: item.watchedNormalEpisodes,
        aniDbTotalEpisodes: item.totalEpisodes,
        category: "ignored_no_watch_evidence",
        note: mapping.note ?? "Curated no-op; no AniList write is justified.",
      };
    }

    if (mapping?.source === "split" && mapping.splitParts?.length) {
      const currentParts = mapping.splitParts.map((part) => ({
        ...part,
        current: currentByMedia.get(part.anilistId),
      }));
      const allCompleted = currentParts.every((part) => part.current?.status === "COMPLETED");

      if (item.watchState === "completed" && allCompleted) {
        return {
          anidbId: item.anidbId,
          anilistIds: mapping.splitParts.map((part) => part.anilistId),
          title: item.title,
          mappingSource: mapping.source,
          watchState: item.watchState,
          aniDbProgress: item.watchedNormalEpisodes,
          aniDbTotalEpisodes: item.totalEpisodes,
          category: "already_completed",
          note: "All AniList split entries are already Completed. Preserve them.",
        };
      }

      if (item.watchState === "completed") {
        return {
          anidbId: item.anidbId,
          anilistIds: mapping.splitParts.map((part) => part.anilistId),
          title: item.title,
          mappingSource: mapping.source,
          watchState: item.watchState,
          aniDbProgress: item.watchedNormalEpisodes,
          aniDbTotalEpisodes: item.totalEpisodes,
          category: "split_completed_candidate",
          proposedSplitChanges: currentParts
            .filter((part) => part.current?.status !== "COMPLETED")
            .map((part) => ({
              anilistId: part.anilistId,
              status: "COMPLETED" as const,
              progress: part.episodes,
            })),
          note:
            mapping.note ??
            "AniDB aggregate maps to multiple AniList entries. Review the split before any write.",
        };
      }

      return {
        anidbId: item.anidbId,
        anilistIds: mapping.splitParts.map((part) => part.anilistId),
        title: item.title,
        mappingSource: mapping.source,
        watchState: item.watchState,
        aniDbProgress: item.watchedNormalEpisodes,
        aniDbTotalEpisodes: item.totalEpisodes,
        category: "unresolved_mapping",
        note: "Split mapping exists, but watched state is not strong enough for an automatic proposal.",
      };
    }

    if (!mapping?.anilistId) {
      return {
        anidbId: item.anidbId,
        title: item.title,
        mappingSource: mapping?.source ?? "unresolved",
        watchState: item.watchState,
        aniDbProgress: item.watchedNormalEpisodes,
        aniDbTotalEpisodes: item.totalEpisodes,
        category: "unresolved_mapping",
        note: "No safe AniList ID mapping. Manual review required; no write is allowed.",
      };
    }

    const current = currentByMedia.get(mapping.anilistId);
    if (!current) {
      if (item.watchState === "completed") {
        return {
          anidbId: item.anidbId,
          anilistId: mapping.anilistId,
          title: item.title,
          mappingSource: mapping.source,
          watchState: item.watchState,
          aniDbProgress: item.watchedNormalEpisodes,
          aniDbTotalEpisodes: item.totalEpisodes,
          category: "missing_completed_candidate",
          proposedChange: {
            status: "COMPLETED",
            progress: item.totalEpisodes || item.watchedNormalEpisodes,
            startedAt: item.firstViewedDate,
            completedAt: item.lastViewedDate,
          },
          note: "Missing from AniList and strongly supported as fully watched by AniDB. Candidate only; dry-run does not write.",
        };
      }
      if (item.watchState === "partial") {
        return {
          anidbId: item.anidbId,
          anilistId: mapping.anilistId,
          title: item.title,
          mappingSource: mapping.source,
          watchState: item.watchState,
          aniDbProgress: item.watchedNormalEpisodes,
          aniDbTotalEpisodes: item.totalEpisodes,
          category: "missing_partial_history",
          proposedChange: { progress: item.watchedNormalEpisodes },
          note: "Historical watched progress exists, but status cannot be inferred safely. Manual review required before adding.",
        };
      }
      return {
        anidbId: item.anidbId,
        anilistId: mapping.anilistId,
        title: item.title,
        mappingSource: mapping.source,
        watchState: item.watchState,
        aniDbProgress: item.watchedNormalEpisodes,
        aniDbTotalEpisodes: item.totalEpisodes,
        category: "missing_unwatched_history",
        note: "AniDB ownership/history exists without watched evidence. Do not infer Planning or Completed.",
      };
    }

    const base = {
      anidbId: item.anidbId,
      anilistId: mapping.anilistId,
      title: item.title,
      mappingSource: mapping.source,
      watchState: item.watchState,
      aniDbProgress: item.watchedNormalEpisodes,
      aniDbTotalEpisodes: item.totalEpisodes,
      aniListStatus: current.status,
      aniListProgress: current.progress,
    };

    if (current.status === "COMPLETED") {
      return {
        ...base,
        category: "already_completed",
        note: "AniList is already Completed. Preserve the current AniList entry.",
      };
    }
    if (current.progress > item.watchedNormalEpisodes) {
      return {
        ...base,
        category: "anilist_ahead",
        note: "AniList progress is ahead of the historical AniDB watched count. Preserve AniList.",
      };
    }
    if (item.watchState === "completed") {
      return {
        ...base,
        category: "completion_conflict",
        proposedChange: {
          status: "COMPLETED",
          progress: item.totalEpisodes || item.watchedNormalEpisodes,
          startedAt: item.firstViewedDate,
          completedAt: item.lastViewedDate,
        },
        note: "AniDB strongly supports completion but AniList is not Completed. Review before any write.",
      };
    }
    if (item.watchedNormalEpisodes > current.progress) {
      return {
        ...base,
        category: "historical_progress_stronger",
        proposedChange: { progress: item.watchedNormalEpisodes },
        note: "AniDB has stronger historical progress evidence. Preserve AniList status; review a progress-only update.",
      };
    }
    return {
      ...base,
      category: "same_or_equivalent",
      note: "No stronger historical change is supported. Preserve AniList.",
    };
  });
}
