import { readFileSync } from "node:fs";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { AniListClient } from "./clients/anilist.js";
import { createLogger } from "./lib/logger.js";
import { parseHistoryBundle } from "./importers/anidb.js";
import {
  completedTargetsAndFingerprint,
  fetchWholeAnimeList,
  resolveMigrationMappings,
} from "./importers/anidbRuntime.js";
import { buildCompletedOnlyWritePlan } from "./importers/anidbWrite.js";

const ViewerResponseSchema = z
  .object({
    Viewer: z.object({
      name: z.string().min(1),
      options: z.object({
        displayAdultContent: z.boolean(),
      }),
    }),
  })
  .loose();

const ReportSchema = z.object({
  writes: z.array(
    z.object({
      mediaId: z.number().int().positive(),
      progress: z.number().int().nonnegative(),
      result: z.enum(["applied", "skipped_existing", "rolled_back"]),
    }),
  ),
});

async function readViewer(client: AniListClient): Promise<{
  name: string;
  displayAdultContent: boolean;
}> {
  const ctx = client.ctx();
  const data = ViewerResponseSchema.parse(
    await ctx.gql.request<unknown>(
      "query{Viewer{name options{displayAdultContent}}}",
      {},
      ctx.requireAuth(),
      { skipCache: true },
    ),
  );
  return {
    name: data.Viewer.name,
    displayAdultContent: data.Viewer.options.displayAdultContent,
  };
}

async function setAdultVisibility(client: AniListClient, enabled: boolean): Promise<void> {
  const ctx = client.ctx();
  await ctx.gql.request(
    "mutation($enabled:Boolean){UpdateUser(displayAdultContent:$enabled){id}}",
    { enabled },
    ctx.requireAuth(),
    { skipCache: true },
  );
  const viewer = await readViewer(client);
  if (viewer.displayAdultContent !== enabled) {
    throw new Error(
      `displayAdultContent verification failed: expected ${enabled}, got ${viewer.displayAdultContent}`,
    );
  }
}

async function probeMedia(client: AniListClient, mediaId: number): Promise<unknown> {
  const ctx = client.ctx();
  return ctx.gql.request<unknown>(
    `query($id:Int){Media(id:$id,type:ANIME){
      id episodes format isAdult
      mediaListEntry{id status progress}
    }}`,
    { id: mediaId },
    ctx.requireAuth(),
    { skipCache: true },
  );
}

async function main(): Promise<void> {
  const [historyPath, reportPath] = process.argv.slice(2);
  if (!historyPath || !reportPath) {
    throw new Error("Usage: anidb-resume-diagnostic <history.json> <apply-report.json>");
  }

  const history = parseHistoryBundle(JSON.parse(readFileSync(historyPath, "utf8")) as unknown);
  const report = ReportSchema.parse(JSON.parse(readFileSync(reportPath, "utf8")) as unknown);

  const config = loadConfig();
  if (!config.auth.accessToken) throw new Error("ANILIST_ACCESS_TOKEN is required");
  const client = new AniListClient(config, createLogger(config.logLevel));

  const originalViewer = await readViewer(client);
  if (originalViewer.name !== "Luciedmeo") {
    throw new Error(`Authenticated viewer is ${originalViewer.name}; expected Luciedmeo`);
  }

  let adultChanged = false;
  try {
    if (!originalViewer.displayAdultContent) {
      adultChanged = true;
      await setAdultVisibility(client, true);
    }

    const mappings = await resolveMigrationMappings(client, history, {
      anonymousFallback: true,
    });
    const { targets, fingerprint: targetFingerprint } = completedTargetsAndFingerprint(
      history,
      mappings,
    );
    const currentList = await fetchWholeAnimeList(client, "Luciedmeo");

    const appliedWrites = report.writes.filter((item) => item.result === "applied");
    const appliedIds = new Set(appliedWrites.map((item) => item.mediaId));

    // Reconstruct the exact pre-run target membership by removing only entries
    // successfully created by the interrupted run. Extra non-target entries do
    // not affect the completed-only action plan.
    const reconstructedBaseline = currentList.filter((entry) => !appliedIds.has(entry.mediaId));
    const originalPlan = buildCompletedOnlyWritePlan(targets, reconstructedBaseline);

    const prefixMatches =
      originalPlan.actions.length >= appliedWrites.length &&
      appliedWrites.every((write, index) => {
        const action = originalPlan.actions[index];
        return action?.anilistId === write.mediaId && action.progress === write.progress;
      });

    const failedAction = originalPlan.actions[appliedWrites.length];
    const currentPlan = buildCompletedOnlyWritePlan(targets, currentList);
    const targetById = new Map(targets.map((target) => [target.anilistId, target]));
    const mismatches = currentPlan.existingTargetEntries
      .map((entry) => {
        const target = targetById.get(entry.mediaId);
        if (!target) return undefined;
        if (entry.status === "COMPLETED" && entry.progress === target.progress) return undefined;
        return {
          mediaId: entry.mediaId,
          expectedStatus: "COMPLETED",
          expectedProgress: target.progress,
          actualStatus: entry.status,
          actualProgress: entry.progress,
        };
      })
      .filter((item) => item !== undefined);

    const failedMedia = failedAction
      ? await probeMedia(client, failedAction.anilistId)
      : undefined;

    process.stdout.write(
      `${JSON.stringify(
        {
          viewer: originalViewer.name,
          originalAdultVisibility: originalViewer.displayAdultContent,
          temporaryAdultVisibilityUsed: adultChanged,
          targetCount: targets.length,
          targetFingerprint,
          currentListEntriesWithAdultVisibility: currentList.length,
          appliedWritesFromInterruptedRun: appliedWrites.length,
          appliedPrefixMatchesOriginalPlan: prefixMatches,
          reconstructedOriginalActions: originalPlan.actions.length,
          failedActionIndexOneBased: failedAction ? appliedWrites.length + 1 : null,
          failedAction: failedAction
            ? {
                anidbId: failedAction.anidbId,
                mediaId: failedAction.anilistId,
                expectedProgress: failedAction.progress,
              }
            : null,
          failedMedia,
          currentExistingTargetEntries: currentPlan.existingTargetEntries.length,
          currentTargetMismatches: mismatches,
          remainingActions: currentPlan.actions.length,
          nextFiveActions: currentPlan.actions.slice(0, 5).map((action) => ({
            anidbId: action.anidbId,
            mediaId: action.anilistId,
            expectedProgress: action.progress,
          })),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (adultChanged) {
      await setAdultVisibility(client, originalViewer.displayAdultContent);
      process.stdout.write("Adult-content preference restored and verified.\n");
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
