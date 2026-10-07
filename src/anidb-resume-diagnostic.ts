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

const MediaProbeSchema = z
  .object({
    Media: z
      .object({
        id: z.number().int().positive(),
        episodes: z.number().int().positive().nullish(),
        format: z.string().nullish(),
        isAdult: z.boolean().nullish(),
        mediaListEntry: z
          .object({
            id: z.number().int().positive(),
            status: z.string().nullish(),
            progress: z.number().int().nonnegative().nullish(),
          })
          .nullish(),
      })
      .nullish(),
  })
  .loose();

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

async function probeMedia(client: AniListClient, mediaId: number) {
  const ctx = client.ctx();
  return MediaProbeSchema.parse(
    await ctx.gql.request<unknown>(
      `query($id:Int){Media(id:$id,type:ANIME){
        id episodes format isAdult
        mediaListEntry{id status progress}
      }}`,
      { id: mediaId },
      ctx.requireAuth(),
      { skipCache: true },
    ),
  );
}

async function main(): Promise<void> {
  const historyPath = process.argv[2];
  if (!historyPath) {
    throw new Error("Usage: anidb-resume-diagnostic <history.json>");
  }

  const history = parseHistoryBundle(JSON.parse(readFileSync(historyPath, "utf8")) as unknown);

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

    const nextAction = currentPlan.actions[0];
    const nextMedia = nextAction ? await probeMedia(client, nextAction.anilistId) : undefined;

    const remainingEpisodeCountMismatches: Array<{
      anidbId: number;
      mediaId: number;
      expectedProgress: number;
      aniListEpisodes: number;
      format?: string | null;
      isAdult?: boolean | null;
    }> = [];
    const unavailableRemainingTargets: Array<{
      anidbId: number;
      mediaId: number;
      error: string;
    }> = [];

    for (const action of currentPlan.actions) {
      try {
        const probe = await probeMedia(client, action.anilistId);
        const media = probe.Media;
        if (!media) {
          unavailableRemainingTargets.push({
            anidbId: action.anidbId,
            mediaId: action.anilistId,
            error: "AniList returned null media",
          });
          continue;
        }
        if (media.episodes != null && media.episodes !== action.progress) {
          remainingEpisodeCountMismatches.push({
            anidbId: action.anidbId,
            mediaId: action.anilistId,
            expectedProgress: action.progress,
            aniListEpisodes: media.episodes,
            format: media.format,
            isAdult: media.isAdult,
          });
        }
      } catch (error) {
        unavailableRemainingTargets.push({
          anidbId: action.anidbId,
          mediaId: action.anilistId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          viewer: originalViewer.name,
          originalAdultVisibility: originalViewer.displayAdultContent,
          temporaryAdultVisibilityUsed: adultChanged,
          targetCount: targets.length,
          targetFingerprint,
          currentListEntriesWithAdultVisibility: currentList.length,
          currentExistingTargetEntries: currentPlan.existingTargetEntries.length,
          currentTargetMismatches: mismatches,
          remainingActions: currentPlan.actions.length,
          remainingEpisodeCountMismatches,
          unavailableRemainingTargets,
          nextAction: nextAction
            ? {
                anidbId: nextAction.anidbId,
                mediaId: nextAction.anilistId,
                expectedProgress: nextAction.progress,
              }
            : null,
          nextMedia,
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
