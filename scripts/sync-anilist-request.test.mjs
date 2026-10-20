// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const request = {
  mediaId: 123,
  expectedTitle: "Synthetic Anime",
  expectedEpisodes: 13,
  status: "COMPLETED",
  progress: 13,
};
const completed = {
  id: 456,
  status: "COMPLETED",
  progress: 13,
  score: 8.5,
  notes: "Synthetic preserved note",
  repeat: 2,
  priority: 1,
  private: true,
  hiddenFromStatusLists: false,
  customLists: ["Synthetic list"],
  advancedScores: { Story: 80 },
  startedAt: { year: 2020, month: 1, day: 1 },
  completedAt: { year: 2020, month: 2, day: 1 },
};
const viewer = { data: { Viewer: { id: 99, name: "Luciedmeo" } } };
/** @param {any} entry */
const media = (entry) => ({
  data: {
    Media: {
      id: 123,
      type: "ANIME",
      format: "TV",
      episodes: 13,
      title: { romaji: "Synthetic Anime", english: null },
      mediaListEntry: entry,
    },
  },
});
const saved = {
  data: {
    SaveMediaListEntry: { id: 456, mediaId: 123, status: "COMPLETED", progress: 13 },
  },
};

/** @param {unknown} input
 * @param {any[]} responses
 * @param {boolean} [token]
 */
function run(input, responses, token = true) {
  const dir = mkdtempSync(join(tmpdir(), "anilist-sync-test-"));
  try {
    const requestPath = join(dir, "request.json");
    const fixturePath = join(dir, "fixture.json");
    const tracePath = join(dir, "trace.json");
    writeFileSync(requestPath, JSON.stringify(input));
    writeFileSync(tracePath, "[]");
    writeFileSync(
      fixturePath,
      JSON.stringify({ tracePath, responses: responses.map((body) => ({ body })) }),
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "./scripts/fixtures/anilist-sync-fetch.mjs",
        "./scripts/sync-anilist-request.mjs",
        requestPath,
      ],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          ANILIST_ACCESS_TOKEN: token ? "synthetic-test-token" : "",
          ANILIST_SYNC_FIXTURE: fixturePath,
        },
      },
    );
    /** @type {Array<{ query: string, variables: Record<string, unknown> }>} */
    const calls = JSON.parse(readFileSync(tracePath, "utf8"));
    return { ...result, calls, writes: calls.filter((c) => c.query.startsWith("mutation")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("completion writes only authorized fields and requires a separate readback", () => {
  const before = { ...completed, status: "CURRENT", progress: 7 };
  const result = run(request, [viewer, media(before), saved, media(completed)]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 4);
  assert.equal(result.writes.length, 1);
  assert.deepEqual(result.writes[0].variables, { id: 123, progress: 13 });
  assert.match(result.writes[0].query, /status:COMPLETED/);
  assert.doesNotMatch(result.writes[0].query, /score|notes|repeat|private|customLists|At/);
  assert.match(result.stdout, /VERIFIED account=Luciedmeo mediaId=123/);
  assert.match(result.stdout, /outcome=APPLIED/);
});

test("already complete still reads back and performs no mutation", () => {
  const result = run({ entries: [request] }, [viewer, media(completed), media(completed)]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 3);
  assert.equal(result.writes.length, 0);
  assert.match(result.stdout, /outcome=ALREADY_CORRECT/);
});

test("new entry is supported without invented score, notes or dates", () => {
  const result = run([request], [viewer, media(null), saved, media(completed)]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.writes.length, 1);
});

test("invalid, duplicate and oversized requests fail before API access", () => {
  for (const input of [
    null,
    { ...request, progress: 12 },
    { ...request, status: "CURRENT" },
    { ...request, mediaId: -1 },
    { ...request, expectedTitle: "" },
    { entries: [] },
    { entries: [request, request] },
    { entries: Array.from({ length: 26 }, (_, i) => ({ ...request, mediaId: i + 1 })) },
  ]) {
    const result = run(input, []);
    assert.notEqual(result.status, 0);
    assert.equal(result.calls.length, 0);
  }
});

test("missing token and wrong authenticated account cannot write", () => {
  const absent = run(request, [], false);
  assert.notEqual(absent.status, 0);
  assert.equal(absent.calls.length, 0);
  const wrong = run(request, [{ data: { Viewer: { id: 99, name: "SomeoneElse" } } }]);
  assert.notEqual(wrong.status, 0);
  assert.equal(wrong.writes.length, 0);
});

test("ID, title, type and episode mismatches fail before mutation", () => {
  for (const patch of [
    { id: 999 },
    { title: { romaji: "Another Anime", english: null } },
    { type: "MANGA" },
    { episodes: 12 },
  ]) {
    const wrong = media(completed);
    Object.assign(wrong.data.Media, patch);
    const result = run(request, [viewer, wrong]);
    assert.notEqual(result.status, 0);
    assert.equal(result.writes.length, 0);
  }
});

test("repeating and regressive progress are conflicts", () => {
  for (const patch of [{ status: "REPEATING" }, { progress: 14 }]) {
    const result = run(request, [viewer, media({ ...completed, ...patch })]);
    assert.notEqual(result.status, 0);
    assert.equal(result.writes.length, 0);
  }
});

test("mutation echo is insufficient when independent readback disagrees", () => {
  const result = run(request, [
    viewer,
    media(null),
    saved,
    media({ ...completed, progress: 12 }),
  ]);
  assert.notEqual(result.status, 0);
  assert.equal(result.writes.length, 1);
  assert.doesNotMatch(result.stdout, /VERIFIED/);
});

test("each unrelated preserved field is checked", () => {
  for (const field of Object.keys(completed).filter((k) => !["status", "progress"].includes(k))) {
    const after = { ...completed, [field]: null };
    const result = run(request, [viewer, media(completed), media(after)]);
    assert.notEqual(result.status, 0, field);
    assert.doesNotMatch(result.stdout, /VERIFIED/);
  }
});

test("API errors stop processing without claiming verification", () => {
  const result = run(request, [{ errors: [{ message: "Synthetic API failure" }] }]);
  assert.notEqual(result.status, 0);
  assert.equal(result.writes.length, 0);
  assert.doesNotMatch(result.stdout, /VERIFIED/);
});

test("later batch failure preserves earlier verified evidence without batch success", () => {
  const second = { ...request, mediaId: 999, expectedTitle: "Second Synthetic Anime" };
  // Defensive missing-Media fixture; not a claim this live response was observed.
  const result = run(
    { entries: [request, second] },
    [viewer, media(null), saved, media(completed), { data: { Media: null } }],
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /VERIFIED account=Luciedmeo mediaId=123/);
  assert.doesNotMatch(result.stdout, /mediaId=999/);
  assert.match(result.stdout, /outcome=APPLIED/);
  assert.equal(result.writes.length, 1);
});
