import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { AniListClient } from "./clients/anilist.js";
import { deleteListEntry, saveListEntry } from "./clients/anilist/list.js";
import { MEDIA_LIST_STATUSES, type MediaListStatus } from "./clients/anilist/enums.js";
import type { ListEntryId, MediaId } from "./clients/anilist/ids.js";
import { createLogger } from "./lib/logger.js";
import { parseHistoryBundle } from "./importers/anidb.js";
import {
  DEFAULT_MAPPING_URL,
  completedTargetFingerprint,
  completedTargetsAndFingerprint,
  currentListSnapshotFingerprint,
  fetchWholeAnimeList,
  resolveMigrationMappings,
} from "./importers/anidbRuntime.js";
import {
  buildCompletedOnlyWritePlan,
  parseProbedListEntry,
  type ProbedListEntry,
} from "./importers/anidbWrite.js";

// Refreshed after interrupted apply run 37555042109 and compatibility
// diagnostic run 37556625813. Fifty historical targets remain absent, but two
// cannot safely be represented as COMPLETED on AniList because AniList counts
// more episodes than the historical watched evidence establishes.
const COMPATIBILITY_EXCLUSIONS = new Map<number, number>([
  [2966, 12], // Spice and Wolf: AniList has 13 episodes; historical evidence proves 12 watched.
  [5081, 12], // Bakemonogatari: AniList has 15 episodes; historical evidence proves 12 watched.
]);

const APPROVED = {
  user: "Luciedmeo",
  animeCount: 208,
  completedTargetCount: 132,
  completedTargetFingerprint: "66e27007ee4e4f7b663abe51e69ec097033a1af8fa52890e5fb951c168e6a953",
  initialAniListEntries: 85,
  initialAniListSnapshotFingerprint:
    "c8fbc2e4d18e792dca1a128550dfd7f0aae241b7aa124ebed3c2f78157962503",
  rawActionCount: 50,
  rawActionFingerprint: "08c77d12ccf5ed147ffc00755beb2994d87b7f0ec172b6a4e2e5b6009472b5eb",
  actionCount: 48,
  actionFingerprint: "4829bc4612a078ceca1b3ec991f27dd21cb36f32952b898ca9d8d7ffa8c7600c",
  confirmation: "APPLY_COMPLETED_ONLY_48",
} as const;

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

const MediaEpisodeProbeSchema = z
  .object({
    Media: z
      .object({
        id: z.number().int().positive(),
        episodes: z.number().int().positive().nullish(),
      })
      .nullish(),
  })
  .loose();

type ActivityMode = "preserve" | "suppress";

interface Args {
  historyBundle?: string;
  user: string;
  mappingUrl: string;
  output?: string;
  apply: boolean;
  confirm?: string;
  activityMode?: ActivityMode;
  help: boolean;
}

interface ActivityOption {
  type: MediaListStatus;
  disabled: boolean;
}

interface WriteResult {
  mediaId: number;
  progress: number;
  result: "applied" | "skipped_existing" | "rolled_back";
  listEntryId?: number;
  note?: string;
}

function usage(): string {
  return `Completed-only AniDB -> AniList migration

Usage:
  node dist/anidb-migration-write.js --history-bundle <history.json> [options]

Options:
  --user <AniList username>        Target account (locked to Luciedmeo for apply)
  --mapping-url <url>              Override the pinned mapping URL (plan mode only)
  --output <path>                  Write the detailed JSON report
  --apply                          Enable the reviewed completed-only writes
  --confirm <phrase>               Must equal ${APPROVED.confirmation}
  --activity-mode <mode>           Required with --apply: preserve | suppress
  --help                           Show this help

Without --apply this command is read-only and only verifies the reviewed plan.
Apply mode requires ANILIST_ACCESS_TOKEN and the exact reviewed snapshot/fingerprints.`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    user: APPROVED.user,
    mappingUrl: DEFAULT_MAPPING_URL,
    apply: false,
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
      case "--history-bundle":
        args.historyBundle = next();
        break;
      case "--user":
        args.user = next();
        break;
      case "--mapping-url":
        args.mappingUrl = next();
        break;
      case "--output":
        args.output = next();
        break;
      case "--apply":
        args.apply = true;
        break;
      case "--confirm":
        args.confirm = next();
        break;
      case "--activity-mode": {
        const mode = next();
        if (mode !== "preserve" && mode !== "suppress") {
          throw new Error("--activity-mode must be preserve or suppress");
        }
        args.activityMode = mode;
        break;
      }
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

function hasDate(
  value: { year?: number | null; month?: number | null; day?: number | null } | null | undefined,
): boolean {
  return Boolean(value?.year || value?.month || value?.day);
}

async function probeAuthenticatedListEntry(
  client: AniListClient,
  mediaId: number,
): Promise<ProbedListEntry | null> {
  const ctx = client.ctx();
  const header = ctx.requireAuth();
  const query = `query($id:Int){Media(id:$id,type:ANIME){
    mediaListEntry{id status progress startedAt{year month day} completedAt{year month day}}
  }}`;
  const data = await ctx.gql.request<unknown>(query, { id: mediaId }, header, { skipCache: true });
  return parseProbedListEntry(data);
}

async function preflightCompletedActions(
  client: AniListClient,
  actions: Array<{ anilistId: number; progress: number }>,
): Promise<void> {
  const ctx = client.ctx();
  const header = ctx.requireAuth();
  const query = `query($id:Int){Media(id:$id,type:ANIME){id episodes}}`;

  for (const action of actions) {
    const data = MediaEpisodeProbeSchema.parse(
      await ctx.gql.request<unknown>(query, { id: action.anilistId }, header, {
        skipCache: true,
      }),
    );
    if (!data.Media) {
      throw new Error(
        `Preflight could not resolve approved AniList media ${action.anilistId}; no list writes applied.`,
      );
    }
    if (data.Media.episodes != null && data.Media.episodes !== action.progress) {
      throw new Error(
        `Preflight episode mismatch for AniList media ${action.anilistId}: historical progress ${action.progress}, AniList episodes ${data.Media.episodes}; no list writes applied.`,
      );
    }
  }
}

async function fetchActivityOptions(client: AniListClient): Promise<ActivityOption[]> {
  const ctx = client.ctx();
  const header = ctx.requireAuth();
  const query = `query{Viewer{options{disabledListActivity{type disabled}}}}`;
  const data = ActivityOptionsResponseSchema.parse(
    await ctx.gql.request<unknown>(query, {}, header, { skipCache: true }),
  );
  const byType = new Map(
    data.Viewer.options.disabledListActivity.map((item) => [
      item.type,
      { type: item.type, disabled: item.disabled ?? false },
    ]),
  );
  const options = MEDIA_LIST_STATUSES.map((type) => byType.get(type));
  if (options.some((item) => !item)) {
    throw new Error("AniList did not return all six disabledListActivity statuses");
  }
  return options as ActivityOption[];
}

async function setActivityOptions(client: AniListClient, options: ActivityOption[]): Promise<void> {
  const ctx = client.ctx();
  const header = ctx.requireAuth();
  const query = `mutation($options:[ListActivityOptionInput]){
    UpdateUser(disabledListActivity:$options){id}
  }`;
  await ctx.gql.request(query, { options }, header, { skipCache: true });

  const verified = await fetchActivityOptions(client);
  for (const expected of options) {
    const actual = verified.find((item) => item.type === expected.type);
    if (!actual || actual.disabled !== expected.disabled) {
      throw new Error("AniList list-activity preference verification failed");
    }
  }
}

async function rollbackCreatedEntry(client: AniListClient, listEntryId: number): Promise<void> {
  await deleteListEntry(client.ctx(), listEntryId as ListEntryId);
}

async function createVerifiedCompletedEntry(
  client: AniListClient,
  action: { anilistId: number; progress: number },
): Promise<WriteResult> {
  const before = await probeAuthenticatedListEntry(client, action.anilistId);
  if (before) {
    return {
      mediaId: action.anilistId,
      progress: action.progress,
      result: "skipped_existing",
      listEntryId: before.id,
      note: "Entry appeared after the reviewed snapshot; preserved without modification.",
    };
  }

  let createdId: number | undefined;
  try {
    await saveListEntry(client.ctx(), {
      mediaId: action.anilistId as MediaId,
      status: "COMPLETED",
      progress: action.progress,
      // Explicit empty fuzzy dates prevent this migration from supplying
      // historical dates. They are verified immediately after the write.
      startedAt: {},
      completedAt: {},
    });

    let after = await probeAuthenticatedListEntry(client, action.anilistId);
    if (!after) throw new Error("AniList write returned but no list entry exists");
    createdId = after.id;

    if (after.status !== "COMPLETED" || after.progress !== action.progress) {
      await rollbackCreatedEntry(client, after.id);
      throw new Error(
        "Created entry did not match the approved status/progress and was rolled back",
      );
    }

    if (hasDate(after.startedAt) || hasDate(after.completedAt)) {
      // Some AniList status transitions can auto-populate dates. Clear them
      // without changing status/progress, then verify. If that fails, delete
      // this newly-created entry to restore the pre-migration state.
      await saveListEntry(client.ctx(), {
        listEntryId: after.id as ListEntryId,
        startedAt: {},
        completedAt: {},
      });
      after = await probeAuthenticatedListEntry(client, action.anilistId);
      if (
        !after ||
        after.status !== "COMPLETED" ||
        after.progress !== action.progress ||
        hasDate(after.startedAt) ||
        hasDate(after.completedAt)
      ) {
        if (after) await rollbackCreatedEntry(client, after.id);
        throw new Error("AniList auto-date cleanup failed; the new entry was rolled back");
      }
    }

    return {
      mediaId: action.anilistId,
      progress: action.progress,
      result: "applied",
      listEntryId: createdId,
    };
  } catch (error) {
    // If the mutation may have succeeded before a transport error surfaced,
    // inspect the authenticated list. Because the entry was absent immediately
    // before this attempt, any unexpected entry here belongs to this attempt.
    const current = await probeAuthenticatedListEntry(client, action.anilistId).catch(() => null);
    if (current) {
      const correct =
        current.status === "COMPLETED" &&
        current.progress === action.progress &&
        !hasDate(current.startedAt) &&
        !hasDate(current.completedAt);
      if (correct) {
        return {
          mediaId: action.anilistId,
          progress: action.progress,
          result: "applied",
          listEntryId: current.id,
          note: "Recovered a successful write after an ambiguous transport result.",
        };
      }
      await rollbackCreatedEntry(client, current.id).catch(() => undefined);
    }
    throw error;
  }
}

function persistReport(path: string | undefined, report: unknown): void {
  if (!path) return;
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.historyBundle) throw new Error(`--history-bundle is required.\n\n${usage()}`);

  const history = parseHistoryBundle(
    JSON.parse(readFileSync(args.historyBundle, "utf8")) as unknown,
  );
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const client = new AniListClient(config, logger);

  const mappings = await resolveMigrationMappings(client, history, {
    mappingUrl: args.mappingUrl,
    // The reviewed write plan was produced from public AniList search results.
    // Keep fallback resolution public even when an access token is configured,
    // otherwise account visibility/preferences can change the mapping set.
    anonymousFallback: true,
  });
  const { targets, fingerprint: targetFingerprint } = completedTargetsAndFingerprint(
    history,
    mappings,
  );
  const currentList = await fetchWholeAnimeList(client, args.user);
  const snapshotFingerprint = currentListSnapshotFingerprint(currentList);
  const plan = buildCompletedOnlyWritePlan(targets, currentList);
  const actionFingerprint = completedTargetFingerprint(plan.actions);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "plan",
    targetUser: args.user,
    approvedPolicy: "completed-only",
    approved: APPROVED,
    observed: {
      aniDbAnime: history.length,
      completedTargets: targets.length,
      completedTargetFingerprint: targetFingerprint,
      aniListEntries: currentList.length,
      aniListSnapshotFingerprint: snapshotFingerprint,
      actions: plan.actions.length,
      actionFingerprint,
      existingTargetEntries: plan.existingTargetEntries.length,
      nonTargetEntries: plan.nonTargetEntries.length,
    },
    activityMode: args.activityMode,
    writes: [] as WriteResult[],
    completed: false,
    activityPreferencesRestored: true,
    error: undefined as string | undefined,
  };
  persistReport(args.output, report);

  if (!args.apply) {
    process.stdout.write(
      [
        "Completed-only migration plan verified",
        `Target: ${args.user}`,
        `AniDB anime: ${history.length}`,
        `Completed target set: ${targets.length}`,
        `Completed target fingerprint: ${targetFingerprint}`,
        `Current AniList entries: ${currentList.length}`,
        `Current AniList snapshot fingerprint: ${snapshotFingerprint}`,
        `Write actions: ${plan.actions.length}`,
        `Write plan fingerprint: ${actionFingerprint}`,
        "Writes applied: 0",
      ].join("\n") + "\n",
    );
    return;
  }

  if (args.user !== APPROVED.user) {
    throw new Error(`Apply mode is locked to AniList user ${APPROVED.user}`);
  }
  if (args.mappingUrl !== DEFAULT_MAPPING_URL) {
    throw new Error("Apply mode forbids mapping URL overrides");
  }
  if (args.confirm !== APPROVED.confirmation) {
    throw new Error(`Apply mode requires --confirm ${APPROVED.confirmation}`);
  }
  if (!args.activityMode) {
    throw new Error("Apply mode requires --activity-mode preserve or suppress");
  }
  if (!config.auth.accessToken) {
    throw new Error("Apply mode requires ANILIST_ACCESS_TOKEN");
  }

  const viewerName = z.object({ Viewer: ViewerSchema }).parse(
    await client.ctx().gql.request<unknown>("query{Viewer{name}}", {}, client.ctx().requireAuth(), {
      skipCache: true,
    }),
  ).Viewer.name;
  if (viewerName !== APPROVED.user) {
    throw new Error(
      `Authenticated AniList account is ${viewerName}; expected ${APPROVED.user}. No writes applied.`,
    );
  }
  const guards = [
    [history.length === APPROVED.animeCount, "AniDB history count changed"],
    [targets.length === APPROVED.completedTargetCount, "Completed target count changed"],
    [
      targetFingerprint === APPROVED.completedTargetFingerprint,
      "Completed target fingerprint changed",
    ],
    [currentList.length === APPROVED.initialAniListEntries, "AniList list size changed"],
    [
      snapshotFingerprint === APPROVED.initialAniListSnapshotFingerprint,
      "AniList snapshot changed since reviewed dry-run",
    ],
    [plan.actions.length === APPROVED.actionCount, "Completed-only action count changed"],
    [actionFingerprint === APPROVED.actionFingerprint, "Completed-only plan fingerprint changed"],
  ] as const;
  const failedGuard = guards.find(([ok]) => !ok);
  if (failedGuard) {
    throw new Error(`${failedGuard[1]}. Run/review a fresh dry-run before any migration write.`);
  }

  let originalActivityOptions: ActivityOption[] | undefined;
  let activityChanged = false;

  try {
    if (args.activityMode === "suppress") {
      originalActivityOptions = await fetchActivityOptions(client);
      const suppressed = originalActivityOptions.map((option) => ({
        ...option,
        disabled: option.type === "COMPLETED" ? true : option.disabled,
      }));
      activityChanged = suppressed.some(
        (option, index) => option.disabled !== originalActivityOptions?.[index]?.disabled,
      );
      if (activityChanged) {
        report.activityPreferencesRestored = false;
        persistReport(args.output, report);
        await setActivityOptions(client, suppressed);
      }
    }

    for (const action of plan.actions) {
      const result = await createVerifiedCompletedEntry(client, action);
      report.writes.push(result);
      persistReport(args.output, report);
    }

    report.completed = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    persistReport(args.output, report);
    throw error;
  } finally {
    if (activityChanged && originalActivityOptions) {
      try {
        await setActivityOptions(client, originalActivityOptions);
        report.activityPreferencesRestored = true;
      } catch (restoreError) {
        report.activityPreferencesRestored = false;
        const message = restoreError instanceof Error ? restoreError.message : String(restoreError);
        report.error = report.error
          ? `${report.error}; activity preference restore failed: ${message}`
          : `Activity preference restore failed: ${message}`;
      }
      persistReport(args.output, report);
    }
  }

  if (!report.activityPreferencesRestored) {
    throw new Error(
      "Migration writes completed, but AniList activity preferences were not restored",
    );
  }

  const finalList = await fetchWholeAnimeList(client, args.user);
  const finalByMedia = new Map(finalList.map((entry) => [entry.mediaId, entry]));
  const missingOrWrong = targets.filter((target) => {
    const entry = finalByMedia.get(target.anilistId);
    return !entry || entry.status !== "COMPLETED" || entry.progress !== target.progress;
  });
  if (missingOrWrong.length) {
    throw new Error(
      `Post-write verification found ${missingOrWrong.length} completed historical targets missing or mismatched`,
    );
  }

  process.stdout.write(
    [
      "Completed-only migration apply finished",
      `Target: ${args.user}`,
      `Planned actions: ${plan.actions.length}`,
      `Applied: ${report.writes.filter((item) => item.result === "applied").length}`,
      `Skipped concurrent existing: ${report.writes.filter((item) => item.result === "skipped_existing").length}`,
      `Activity mode: ${args.activityMode}`,
      `Activity preferences restored: ${report.activityPreferencesRestored}`,
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
