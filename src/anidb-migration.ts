import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { AniListClient } from "./clients/anilist.js";
import { getUserList } from "./clients/anilist/list.js";
import { searchMedia } from "./clients/anilist/search.js";
import { getAuthorizedUser } from "./clients/anilist/user.js";
import { createLogger } from "./lib/logger.js";
import {
  applyCuratedMappingOverrides,
  buildAniDbHistory,
  chooseFallbackMatch,
  compareMigration,
  exactMappings,
  parseCompactAniListRows,
  parseHistoryBundle,
  parseIdMappings,
  parseJsonLarge,
  parseSearchCandidates,
  parseUdpMyList,
  type AniDbHistory,
  type ResolvedMapping,
} from "./importers/anidb.js";

const DEFAULT_MAPPING_URL =
  "https://raw.githubusercontent.com/anime-and-manga/lists/06a316a574937d009a4dd2db65a4d0972d53c2de/anime.json";

const ViewerSchema = z.object({ name: z.string().min(1) }).loose();

interface Args {
  jsonLarge?: string;
  udp?: string;
  historyBundle?: string;
  user: string;
  mappingFile?: string;
  mappingUrl: string;
  output?: string;
  skipFallback: boolean;
  help: boolean;
}

function usage(): string {
  return `AniDB -> AniList migration dry-run\n\nUsage:\n  node dist/anidb-migration.js --json-large <json-large.tgz|mylist.json> \\\n    --udp <txt-udp-mylist.tgz|mylist.txt> [options]\n\n  node dist/anidb-migration.js --history-bundle <history.json> [options]\n\nOptions:\n  --history-bundle <path>     Use a normalized private history bundle instead of raw exports\n  --user <AniList username>   Target account (default: Luciedmeo)\n  --mapping-file <path>       Use a local AniDB/AniList mapping JSON\n  --mapping-url <url>         Override the pinned mapping URL\n  --output <path>             Write the full JSON report to this file\n  --skip-fallback             Do not query AniList for unresolved ID mappings\n  --help                      Show this help\n\nThis command is strictly read-only. It never calls an AniList mutation.`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    user: "Luciedmeo",
    mappingUrl: DEFAULT_MAPPING_URL,
    skipFallback: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };

    switch (arg) {
      case "--json-large":
        args.jsonLarge = next();
        break;
      case "--udp":
        args.udp = next();
        break;
      case "--history-bundle":
        args.historyBundle = next();
        break;
      case "--user":
        args.user = next();
        break;
      case "--mapping-file":
        args.mappingFile = next();
        break;
      case "--mapping-url":
        args.mappingUrl = next();
        break;
      case "--output":
        args.output = next();
        break;
      case "--skip-fallback":
        args.skipFallback = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readNullTerminated(buffer: Buffer): string {
  const end = buffer.indexOf(0);
  return buffer
    .subarray(0, end >= 0 ? end : buffer.length)
    .toString("utf8")
    .trim();
}

function parseTarSize(field: Buffer): number {
  const raw = readNullTerminated(field).replace(/\s/g, "");
  if (!raw) return 0;
  if (!/^[0-7]+$/.test(raw)) throw new Error(`Unsupported tar size field: ${raw}`);
  return Number.parseInt(raw, 8);
}

function readTarMember(tar: Buffer, wantedName: string): Buffer {
  let offset = 0;
  let longName: string | undefined;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = readNullTerminated(header.subarray(0, 100));
    const prefix = readNullTerminated(header.subarray(345, 500));
    const headerName = prefix ? `${prefix}/${name}` : name;
    const size = parseTarSize(header.subarray(124, 136));
    const type = String.fromCharCode(header[156] || 0);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error("Truncated tar archive");

    const body = tar.subarray(dataStart, dataEnd);
    if (type === "L") {
      longName = readNullTerminated(body);
    } else {
      const effectiveName = longName ?? headerName;
      longName = undefined;
      if (
        effectiveName === wantedName ||
        effectiveName.endsWith(`/${wantedName}`) ||
        basename(effectiveName) === wantedName
      ) {
        return body;
      }
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  throw new Error(`Archive does not contain ${wantedName}`);
}

function readExportText(path: string, memberName: string): string {
  const bytes = readFileSync(path);
  const lower = path.toLowerCase();
  if (lower.endsWith(".tgz") || lower.endsWith(".tar.gz")) {
    return readTarMember(gunzipSync(bytes), memberName).toString("utf8");
  }
  return bytes.toString("utf8");
}

async function loadMappings(mappingFile: string | undefined, mappingUrl: string) {
  if (mappingFile) {
    return parseIdMappings(JSON.parse(readFileSync(mappingFile, "utf8")) as unknown);
  }

  const response = await fetch(mappingUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`Mapping download failed: HTTP ${response.status}`);
  }
  return parseIdMappings(await response.json());
}

async function fetchWholeAnimeList(client: AniListClient, user: string) {
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

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const rawMode = Boolean(args.jsonLarge || args.udp);
  if (args.historyBundle && rawMode) {
    throw new Error(`Use either --history-bundle or --json-large/--udp, not both.\n\n${usage()}`);
  }
  if (!args.historyBundle && (!args.jsonLarge || !args.udp)) {
    throw new Error(
      `Provide --history-bundle, or provide both --json-large and --udp.\n\n${usage()}`,
    );
  }

  const history = args.historyBundle
    ? parseHistoryBundle(JSON.parse(readFileSync(args.historyBundle, "utf8")) as unknown)
    : buildAniDbHistory(
        parseJsonLarge(readExportText(args.jsonLarge!, "mylist.json")),
        parseUdpMyList(readExportText(args.udp!, "mylist.txt")),
      );
  const mappingData = await loadMappings(args.mappingFile, args.mappingUrl);
  let mappings = exactMappings(history, mappingData);

  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const client = new AniListClient(config, logger);

  let authMode: "authenticated" | "public" = "public";
  let authenticatedViewer: string | undefined;
  if (client.isConfigured()) {
    const viewer = ViewerSchema.parse(await getAuthorizedUser(client.ctx()));
    authenticatedViewer = viewer.name;
    if (viewer.name.toLowerCase() !== args.user.toLowerCase()) {
      throw new Error(
        `Authenticated AniList account is ${viewer.name}, but --user is ${args.user}. Refusing to compare against the wrong account.`,
      );
    }
    authMode = "authenticated";
  }

  if (!args.skipFallback) mappings = await resolveFallbackMappings(client, history, mappings);
  mappings = applyCuratedMappingOverrides(mappings);

  const currentList = await fetchWholeAnimeList(client, args.user);
  const comparisons = compareMigration(history, mappings, currentList);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    writesApplied: 0,
    targetUser: args.user,
    authMode,
    authenticatedViewer,
    mappingSource: args.mappingFile ?? args.mappingUrl,
    sources: args.historyBundle
      ? { historyBundle: args.historyBundle }
      : { jsonLarge: args.jsonLarge, udpMyList: args.udp },
    summary: {
      aniDbAnime: history.length,
      aniListEntries: currentList.length,
      mappings: countBy(mappings, (item) => item.source),
      watchStates: countBy(history, (item) => item.watchState),
      comparisonCategories: countBy(comparisons, (item) => item.category),
    },
    mappings,
    comparisons,
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) writeFileSync(args.output, json, "utf8");

  process.stdout.write(
    [
      "AniDB -> AniList dry-run complete",
      `Target: ${args.user} (${authMode})`,
      `AniDB anime: ${history.length}`,
      `AniList entries: ${currentList.length}`,
      `Mappings: ${JSON.stringify(report.summary.mappings)}`,
      `Watch states: ${JSON.stringify(report.summary.watchStates)}`,
      `Comparison: ${JSON.stringify(report.summary.comparisonCategories)}`,
      `Writes applied: ${report.writesApplied}`,
      args.output ? `Report: ${args.output}` : "Use --output <file> to save the full report.",
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
