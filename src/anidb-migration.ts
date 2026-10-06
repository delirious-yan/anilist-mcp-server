import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { AniListClient } from "./clients/anilist.js";
import { getAuthorizedUser } from "./clients/anilist/user.js";
import { createLogger } from "./lib/logger.js";
import {
  buildAniDbHistory,
  compareMigration,
  parseHistoryBundle,
  parseJsonLarge,
  parseUdpMyList,
} from "./importers/anidb.js";
import {
  DEFAULT_MAPPING_URL,
  completedTargetsAndFingerprint,
  countBy,
  fetchWholeAnimeList,
  resolveMigrationMappings,
} from "./importers/anidbRuntime.js";

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

  const mappings = await resolveMigrationMappings(client, history, {
    mappingFile: args.mappingFile,
    mappingUrl: args.mappingUrl,
    skipFallback: args.skipFallback,
  });
  const { targets: completedTargets, fingerprint: completedTargetFingerprint } =
    completedTargetsAndFingerprint(history, mappings);

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
      completedHistoricalTargets: completedTargets.length,
      completedHistoricalTargetFingerprint: completedTargetFingerprint,
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
      `Completed target set: ${report.summary.completedHistoricalTargets}`,
      `Completed target fingerprint: ${report.summary.completedHistoricalTargetFingerprint}`,
      `Writes applied: ${report.writesApplied}`,
      args.output ? `Report: ${args.output}` : "Use --output <file> to save the full report.",
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
