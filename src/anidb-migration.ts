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
