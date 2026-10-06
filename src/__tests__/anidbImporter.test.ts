import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAniDbHistory,
  chooseFallbackMatch,
  compareMigration,
  exactMappings,
  parseCompactAniListRows,
  parseHistoryBundle,
  parseIdMappings,
  parseJsonLarge,
  parseUdpMyList,
} from "../importers/anidb.js";

test("parseJsonLarge repairs AniDB's invalid backtick escape", () => {
  const anime = parseJsonLarge(String.raw`{
    "anime": [{
      "id": 1,
      "broadcastDate": "01.01.2006",
      "type": "TV Series",
      "totalEpisodes": "2",
      "ownEpisodes": "2",
      "romanjiName": "Shin\`yaku",
      "englishName": "",
      "episodes": [{"id":"10","number":"1"},{"id":"11","number":"2"}]
    }]
  }`);
  assert.equal(anime.length, 1);
  assert.equal(anime[0]!.romanjiName, "Shin`yaku");
  assert.equal(anime[0]!.totalEpisodes, 2);
});

test("parseHistoryBundle accepts the repo-only normalized private input", () => {
  const history = parseHistoryBundle({
    version: 1,
    source: "AniDB exports",
    anime: [
      {
        anidbId: 100,
        title: "Example",
        type: "TV Series",
        year: 2006,
        totalEpisodes: 2,
        ownedNormalEpisodes: 2,
        watchedNormalEpisodes: 2,
        firstViewedAt: null,
        lastViewedAt: null,
        firstViewedDate: null,
        lastViewedDate: null,
        fullyWatched: true,
        allOwnedNormalWatched: true,
        watchState: "completed",
      },
    ],
  });
  assert.equal(history.length, 1);
  assert.equal(history[0]!.anidbId, 100);
  assert.equal(history[0]!.watchState, "completed");
  assert.equal(history[0]!.firstViewedAt, undefined);
  assert.equal(history[0]!.firstViewedDate, undefined);
});

test("parseIdMappings ignores dataset rows with no AniDB ID", () => {
  const mappings = parseIdMappings([
    { idAniDB: 0, idAL: 1, idMal: 1 },
    { idAniDB: 100, idAL: 200, idMal: 300 },
  ]);
  assert.deepEqual(mappings, [{ idAniDB: 100, idAL: 200, idMal: 300 }]);
});

test("parseUdpMyList keeps the fields needed for watched reconstruction", () => {
  const records = parseUdpMyList(`# comment
221 MYLIST
1|2|10|100|5|1700000000|1|1700000100||||0
221 MYLIST
3|4|11|100|5|1700000200|1|0||||0
`);
  assert.deepEqual(records, [
    {
      lid: 1,
      fid: 2,
      eid: 10,
      aid: 100,
      gid: 5,
      addedAt: 1700000000,
      state: 1,
      viewedAt: 1700000100,
    },
    { lid: 3, fid: 4, eid: 11, aid: 100, gid: 5, addedAt: 1700000200, state: 1, viewedAt: 0 },
  ]);
});

test("buildAniDbHistory distinguishes complete, partial and unwatched history", () => {
  const anime = parseJsonLarge(
    JSON.stringify({
      anime: [
        {
          id: 100,
          broadcastDate: "01.01.2006",
          type: "TV Series",
          totalEpisodes: "2",
          ownEpisodes: "2",
          romanjiName: "Complete",
          englishName: "Complete",
          episodes: [
            { id: "10", number: "1" },
            { id: "11", number: "2" },
          ],
        },
        {
          id: 200,
          broadcastDate: "01.01.2007",
          type: "TV Series",
          totalEpisodes: "3",
          ownEpisodes: "2",
          romanjiName: "Partial",
          englishName: "Partial",
          episodes: [
            { id: "20", number: "1" },
            { id: "21", number: "2" },
          ],
        },
        {
          id: 300,
          broadcastDate: "01.01.2008",
          type: "Movie",
          totalEpisodes: "1",
          ownEpisodes: "1",
          romanjiName: "Unwatched",
          englishName: "Unwatched",
          episodes: [{ id: "30", number: "1" }],
        },
      ],
    }),
  );
  const udp = parseUdpMyList(`
1|1|10|100|1|1|1|1000||||0
2|2|11|100|1|1|1|2000||||0
3|3|20|200|1|1|1|3000||||0
4|4|21|200|1|1|1|0||||0
5|5|30|300|1|1|1|0||||0
`);

  const history = buildAniDbHistory(anime, udp);
  assert.equal(history[0]!.watchState, "completed");
  assert.equal(history[0]!.watchedNormalEpisodes, 2);
  assert.equal(history[1]!.watchState, "partial");
  assert.equal(history[1]!.watchedNormalEpisodes, 1);
  assert.equal(history[2]!.watchState, "unwatched");
});

test("exactMappings only resolves a unique AniDB to AniList mapping", () => {
  const history = [
    {
      anidbId: 1,
      title: "A",
      type: "TV Series",
      totalEpisodes: 1,
      ownedNormalEpisodes: 1,
      watchedNormalEpisodes: 1,
      fullyWatched: true,
      allOwnedNormalWatched: true,
      watchState: "completed" as const,
    },
    {
      anidbId: 2,
      title: "B",
      type: "TV Series",
      totalEpisodes: 1,
      ownedNormalEpisodes: 1,
      watchedNormalEpisodes: 0,
      fullyWatched: false,
      allOwnedNormalWatched: false,
      watchState: "unwatched" as const,
    },
  ];
  const resolved = exactMappings(history, [
    { idAniDB: 1, idAL: 10 },
    { idAniDB: 2, idAL: 20 },
    { idAniDB: 2, idAL: 21 },
  ]);
  assert.deepEqual(resolved[0]!, { anidbId: 1, anilistId: 10, source: "exact" });
  assert.deepEqual(resolved[1]!, { anidbId: 2, source: "unresolved" });
});

test("fallback matching requires a strong and clearly better candidate", () => {
  const history = {
    anidbId: 1,
    title: "Cowboy Bebop",
    englishTitle: "Cowboy Bebop",
    type: "TV Series",
    year: 1998,
    totalEpisodes: 26,
    ownedNormalEpisodes: 26,
    watchedNormalEpisodes: 26,
    fullyWatched: true,
    allOwnedNormalWatched: true,
    watchState: "completed" as const,
  };
  const result = chooseFallbackMatch(history, [
    {
      id: 1,
      idMal: 1,
      format: "TV",
      episodes: 26,
      startDate: { year: 1998, month: 4, day: 3 },
      title: { romaji: "Cowboy Bebop", english: "Cowboy Bebop", native: null },
    },
    {
      id: 2,
      idMal: 2,
      format: "MOVIE",
      episodes: 1,
      startDate: { year: 2001, month: 9, day: 1 },
      title: {
        romaji: "Cowboy Bebop: Tengoku no Tobira",
        english: "Cowboy Bebop: The Movie",
        native: null,
      },
    },
  ]);
  assert.equal(result.match?.id, 1);
  assert.ok((result.match?.score ?? 0) >= 10);
});

test("parseCompactAniListRows parses the MCP compact TSV shape", () => {
  const rows = parseCompactAniListRows(
    "11\t22\t33\tCURRENT\t8.5\t4\tExample Title\n12\t23\t\tCOMPLETED\t\t12\tOther",
  );
  assert.deepEqual(rows[0]!, {
    entryId: 11,
    mediaId: 22,
    idMal: 33,
    status: "CURRENT",
    score: 8.5,
    progress: 4,
    title: "Example Title",
  });
  assert.equal(rows[1]!.idMal, undefined);
  assert.equal(rows[1]!.progress, 12);
});

test("compareMigration is conservative and never turns unwatched ownership into completion", () => {
  const history = [
    {
      anidbId: 1,
      title: "Complete",
      type: "TV Series",
      totalEpisodes: 12,
      ownedNormalEpisodes: 12,
      watchedNormalEpisodes: 12,
      firstViewedDate: { year: 2020, month: 1, day: 1 },
      lastViewedDate: { year: 2020, month: 1, day: 12 },
      fullyWatched: true,
      allOwnedNormalWatched: true,
      watchState: "completed" as const,
    },
    {
      anidbId: 2,
      title: "Owned Only",
      type: "TV Series",
      totalEpisodes: 12,
      ownedNormalEpisodes: 12,
      watchedNormalEpisodes: 0,
      fullyWatched: false,
      allOwnedNormalWatched: false,
      watchState: "unwatched" as const,
    },
  ];
  const comparisons = compareMigration(
    history,
    [
      { anidbId: 1, anilistId: 101, source: "exact" },
      { anidbId: 2, anilistId: 102, source: "exact" },
    ],
    [],
  );
  assert.equal(comparisons[0]!.category, "missing_completed_candidate");
  assert.equal(comparisons[0]!.proposedChange?.status, "COMPLETED");
  assert.equal(comparisons[1]!.category, "missing_unwatched_history");
  assert.equal(comparisons[1]!.proposedChange, undefined);
});

test("compareMigration preserves AniList when it is ahead of AniDB", () => {
  const history = [
    {
      anidbId: 1,
      title: "Partial",
      type: "TV Series",
      totalEpisodes: 24,
      ownedNormalEpisodes: 12,
      watchedNormalEpisodes: 11,
      fullyWatched: false,
      allOwnedNormalWatched: false,
      watchState: "partial" as const,
    },
  ];
  const comparisons = compareMigration(
    history,
    [{ anidbId: 1, anilistId: 101, source: "exact" }],
    [{ entryId: 1, mediaId: 101, status: "CURRENT", progress: 15, title: "Partial" }],
  );
  assert.equal(comparisons[0]!.category, "anilist_ahead");
  assert.equal(comparisons[0]!.proposedChange, undefined);
});
