import { readFileSync } from "node:fs";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { AniListClient } from "./clients/anilist.js";
import { MEDIA_LIST_STATUSES, type MediaListStatus } from "./clients/anilist/enums.js";
import { createLogger } from "./lib/logger.js";
import { parseHistoryBundle } from "./importers/anidb.js";
import {
  completedTargetsAndFingerprint,
  currentListSnapshotFingerprint,
  fetchWholeAnimeList,
  resolveMigrationMappings,
} from "./importers/anidbRuntime.js";
import { buildCompletedOnlyWritePlan, parseProbedListEntry } from "./importers/anidbWrite.js";

const ViewerSchema = z.object({ name: z.string().min(1) }).loose();

const ActivityOptionSchema = z.object({
  type: z.enum(MEDIA_LIST_STATUSES),
  disabled: z.boolean().nullish(),
});

const ActivityOptionsResponseSchema = z
  .object({
    Viewer: z.object({
      options: z.object({
        disabledListActivity: z.array(ActivityOptionSchema),
      }),
    }),
  })
  .loose();

interface ActivityOption {
  type: MediaListStatus;
  disabled: boolean;
}

async function fetchActivityOptions(client: AniListClient): Promise<ActivityOption[]> {
  const ctx = client.ctx();
  const data = ActivityOptionsResponseSchema.parse(
    await ctx.gql.request<unknown>(
      "query{Viewer{options{disabledListActivity{type disabled}}}}",
      {},
      ctx.requireAuth(),
      { skipCache: true },
    ),
  );
  const byType = new Map(
    data.Viewer.options.disabledListActivity.map((item) => [
      item.type,
      { type: item.type, disabled: item.disabled ?? false },
    ]),
  );
  return MEDIA_LIST_STATUSES.map((type) => {
    const item = byType.get(type);
    if (!item) throw new Error(`Missing activity option for ${type}`);
    return item;
  });
}

async function setActivityOptions(
  client: AniListClient,
  options: ActivityOption[],
): Promise<void> {
  const ctx = client.ctx();
  await ctx.gql.request(
    `mutation($options:[ListActivityOptionInput]){
      UpdateUser(disabledListActivity:$options){id}
    }`,
    { options },
    ctx.requireAuth(),
    { skipCache: true },
  );
}

async function probeMedia(client: AniListClient, mediaId: number): Promise<void> {
  const ctx = client.ctx();
  const data = await ctx.gql.request<unknown>(
    `query($id:Int){Media(id:$id,type:ANIME){
      id
      mediaListEntry{id status progress}
    }}`,
    { id: mediaId },
    ctx.requireAuth(),
    { skipCache: true },
  );
  parseProbedListEntry(data);
}

async function main(): Promise<void> {
  const historyPath = process.argv[2];
  if (!historyPath) throw new Error("Usage: anidb-apply-diagnostic <history-bundle.json>");

  const history = parseHistoryBundle(JSON.parse(readFileSync(historyPath, "utf8")) as unknown);
  const config = loadConfig();
  const client = new AniListClient(config, createLogger(config.logLevel));
  if (!config.auth.accessToken) throw new Error("ANILIST_ACCESS_TOKEN is required");

  const viewer = z
    .object({ Viewer: ViewerSchema })
    .parse(
      await client
        .ctx()
        .gql.request<unknown>("query{Viewer{name}}", {}, client.ctx().requireAuth(), {
          skipCache: true,
        }),
    ).Viewer.name;
  if (viewer !== "Luciedmeo") throw new Error(`Unexpected viewer: ${viewer}`);

  const mappings = await resolveMigrationMappings(client, history, {
    anonymousFallback: true,
  });
  const { targets, fingerprint } = completedTargetsAndFingerprint(history, mappings);
  const currentList = await fetchWholeAnimeList(client, "Luciedmeo");
  const plan = buildCompletedOnlyWritePlan(targets, currentList);

  process.stdout.write(
    [
      `viewer=${viewer}`,
      `history=${history.length}`,
      `targets=${targets.length}`,
      `targetFingerprint=${fingerprint}`,
      `current=${currentList.length}`,
      `snapshotFingerprint=${currentListSnapshotFingerprint(currentList)}`,
      `actions=${plan.actions.length}`,
    ].join("\n") + "\n",
  );

  const original = await fetchActivityOptions(client);
  const suppressed = original.map((item) => ({
    ...item,
    disabled: item.type === "COMPLETED" ? true : item.disabled,
  }));

  process.stdout.write("stage=activity-suppress-test\n");
  await setActivityOptions(client, suppressed);
  const afterSuppress = await fetchActivityOptions(client);
  const completedSuppressed = afterSuppress.find((item) => item.type === "COMPLETED")?.disabled;
  if (completedSuppressed !== true) {
    throw new Error("COMPLETED activity was not suppressed during diagnostic");
  }
  await setActivityOptions(client, original);
  const restored = await fetchActivityOptions(client);
  if (JSON.stringify(restored) !== JSON.stringify(original)) {
    throw new Error("Activity settings did not restore after diagnostic");
  }
  process.stdout.write("stage=activity-suppress-test ok\n");

  process.stdout.write("stage=probe-all-actions\n");
  const failures: Array<{
    index: number;
    anidbId: number;
    mediaId: number;
    error: string;
  }> = [];
  for (let index = 0; index < plan.actions.length; index += 1) {
    const action = plan.actions[index]!;
    try {
      await probeMedia(client, action.anilistId);
    } catch (error) {
      failures.push({
        index: index + 1,
        anidbId: action.anidbId,
        mediaId: action.anilistId,
        error: error instanceof Error ? error.message : String(error),
      });
      process.stdout.write(
        `probe-failure index=${index + 1} anidbId=${action.anidbId} mediaId=${action.anilistId}\n`,
      );
    }
    if ((index + 1) % 20 === 0 || index + 1 === plan.actions.length) {
      process.stdout.write(`probed=${index + 1}/${plan.actions.length}\n`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Read-only probe found ${failures.length} invalid/unavailable targets: ${JSON.stringify(failures)}`,
    );
  }
  process.stdout.write("stage=probe-all-actions ok\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
