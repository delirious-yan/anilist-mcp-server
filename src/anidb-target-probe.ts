import { readFileSync } from "node:fs";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { AniListClient } from "./clients/anilist.js";
import { createLogger } from "./lib/logger.js";
import { parseHistoryBundle } from "./importers/anidb.js";
import {
  completedTargetFingerprint,
  completedTargetsAndFingerprint,
  currentListSnapshotFingerprint,
  fetchWholeAnimeList,
  resolveMigrationMappings,
} from "./importers/anidbRuntime.js";
import { buildCompletedOnlyWritePlan } from "./importers/anidbWrite.js";

const ProbeSchema = z
  .object({
    Media: z
      .object({
        id: z.number().int().positive(),
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

async function main(): Promise<void> {
  const historyPath = process.argv[2];
  if (!historyPath) throw new Error("history bundle path required");

  const history = parseHistoryBundle(JSON.parse(readFileSync(historyPath, "utf8")) as unknown);
  const config = loadConfig();
  const client = new AniListClient(config, createLogger(config.logLevel));
  if (!config.auth.accessToken) throw new Error("ANILIST_ACCESS_TOKEN required");

  const viewer = z
    .object({ Viewer: z.object({ name: z.string() }) })
    .parse(
      await client
        .ctx()
        .gql.request<unknown>("query{Viewer{name}}", {}, client.ctx().requireAuth(), {
          skipCache: true,
        }),
    ).Viewer.name;

  if (viewer !== "Luciedmeo") throw new Error(`Unexpected viewer: ${viewer}`);

  const mappings = await resolveMigrationMappings(client, history);
  const { targets, fingerprint: targetFingerprint } = completedTargetsAndFingerprint(history, mappings);
  const currentList = await fetchWholeAnimeList(client, viewer);
  const plan = buildCompletedOnlyWritePlan(targets, currentList);
  const snapshotFingerprint = currentListSnapshotFingerprint(currentList);
  const actionFingerprint = completedTargetFingerprint(plan.actions);

  process.stdout.write(
    [
      `Probe start: current=${currentList.length} targets=${targets.length} existingTargets=${plan.existingTargetEntries.length} actions=${plan.actions.length}`,
      `Target fingerprint: ${targetFingerprint}`,
      `Snapshot fingerprint: ${snapshotFingerprint}`,
      `Action fingerprint: ${actionFingerprint}`,
    ].join("\n") + "\n",
  );

  let failures = 0;
  for (let index = 0; index < plan.actions.length; index += 1) {
    const action = plan.actions[index]!;
    try {
      const data = ProbeSchema.parse(
        await client
          .ctx()
          .gql.request<unknown>(
            "query($id:Int){Media(id:$id,type:ANIME){id mediaListEntry{id status progress}}}",
            { id: action.anilistId },
            client.ctx().requireAuth(),
            { skipCache: true },
          ),
      );

      if (!data.Media) {
        failures += 1;
        process.stdout.write(
          `PROBE_FAIL index=${index + 1} mediaId=${action.anilistId} reason=media-null\n`,
        );
      }
    } catch (error) {
      failures += 1;
      process.stdout.write(
        `PROBE_FAIL index=${index + 1} mediaId=${action.anilistId} error=${
          error instanceof Error ? error.message.replace(/\s+/g, " ") : String(error)
        }\n`,
      );
    }

    if ((index + 1) % 20 === 0 || index + 1 === plan.actions.length) {
      process.stdout.write(`Probed ${index + 1}/${plan.actions.length}\n`);
    }
  }

  process.stdout.write(`Probe complete: failures=${failures}\n`);
  if (failures > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
