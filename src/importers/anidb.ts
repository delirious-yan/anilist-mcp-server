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

const JsonLargeSchema = z
  .object({ anime: z.array(JsonAnimeSchema) })
  .loose();

const MappingSchema = z
  .object({
    idAniDB: z.coerce.number().int().positive(),
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

export interface FallbackCandidate {
  id: number;
  score: number;
  title: string;
  year?: number;
  format?: string;
  episodes?: number;
}

export interface ResolvedMapping {
  anidbId: number;
  anilistId?: number;
  source: "exact" | "fallback" | "unresolved";
  confidence?: number;
  candidates?: FallbackCandidate[];
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

export interface MigrationComparison {
  anidbId: number;
  anilistId?: number;
  title: string;
  mappingSource: ResolvedMapping["source"];
  watchState: AniDbHistory["watchState"];
  aniDbProgress: number;
  aniDbTotalEpisodes: number;
  aniListStatus?: string;
  aniListProgress?: number;
  category:
    | "unresolved_mapping"
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

export function parseIdMappings(value: unknown): IdMapping[] {
  return MappingListSchema.parse(value);
}

export function exactMappings(
  history: AniDbHistory[],
  mappings: IdMapping[],
): ResolvedMapping[] {
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

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function aniDbTypeToAniListFormat(type: string): string | undefined {
  switch (type.trim().toLowerCase()) {
    case "tv series": return "TV";
    case "tv special": return "SPECIAL";
    case "ova": return "OVA";
    case "movie": return "MOVIE";
    case "web": return "ONA";
    case "music video": return "MUSIC";
    default: return undefined;
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
      const titles = [candidate.title?.romaji, candidate.title?.english, candidate.title?.native]
        .filter((title): title is string => Boolean(title));
      const normalized = titles.map(normalizeTitle);
      const exactTitle = normalized.some((title) => expectedTitles.has(title));
      const partialTitle = normalized.some((title) =>
        [...expectedTitles].some(
          (expected) =>
            Boolean(expected) && Boolean(title) &&
            (title.includes(expected) || expected.includes(title)),
        ),
      );

      let score = exactTitle ? 8 : partialTitle ? 4 : 0;
      const candidateYear = candidate.startDate?.year ?? undefined;
      if (history.year && candidateYear === history.year) score += 3;
      else if (history.year && candidateYear && Math.abs(candidateYear - history.year) === 1) score += 1;
      if (expectedFormat && candidate.format === expectedFormat) score += 2;
      if (history.totalEpisodes > 0 && candidate.episodes && candidate.episodes === history.totalEpisodes) score += 2;

      return {
        id: candidate.id,
        score,
        title: candidate.title?.english ?? candidate.title?.romaji ?? candidate.title?.native ?? `AniList ${candidate.id}`,
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

export function compareMigration(
  history: AniDbHistory[],
  resolved: ResolvedMapping[],
  currentList: AniListListEntry[],
): MigrationComparison[] {
  const mappingByAniDb = new Map(resolved.map((item) => [item.anidbId, item]));
  const currentByMedia = new Map(currentList.map((entry) => [entry.mediaId, entry]));

  return history.map((item) => {
    const mapping = mappingByAniDb.get(item.anidbId);
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
      return { ...base, category: "already_completed", note: "AniList is already Completed. Preserve the current AniList entry." };
    }
    if (current.progress > item.watchedNormalEpisodes) {
      return { ...base, category: "anilist_ahead", note: "AniList progress is ahead of the historical AniDB watched count. Preserve AniList." };
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
    return { ...base, category: "same_or_equivalent", note: "No stronger historical change is supported. Preserve AniList." };
  });
}
