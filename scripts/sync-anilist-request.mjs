import { readFileSync } from "node:fs";
/** @typedef {{mediaId: number, expectedTitle: string, expectedEpisodes: number, status: string, progress: number}} AniRequest */
const token = process.env.ANILIST_ACCESS_TOKEN;
if (!token) throw Error("AniList token secret unavailable");
const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
/** @type {AniRequest[]} */
const requests = Array.isArray(input)
  ? input
  : Array.isArray(input.entries)
    ? input.entries
    : [input];
if (requests.length < 1 || requests.length > 25)
  throw Error("Request must contain 1 to 25 entries");
const ids = requests.map((r) => r.mediaId);
if (new Set(ids).size !== ids.length) throw Error("Duplicate media IDs");
for (const request of requests) {
  const scoreOnly = Object.hasOwn(request, "score");
  const allowed = scoreOnly
    ? ["mediaId", "expectedTitle", "expectedEpisodes", "score"]
    : ["mediaId", "expectedTitle", "expectedEpisodes", "status", "progress"];
  const commonValid =
    Number.isSafeInteger(request.mediaId) &&
    request.mediaId > 0 &&
    typeof request.expectedTitle === "string" &&
    request.expectedTitle.length >= 3 &&
    request.expectedTitle.length <= 120 &&
    Number.isSafeInteger(request.expectedEpisodes) &&
    request.expectedEpisodes > 0 &&
    Object.keys(request).every((key) => allowed.includes(key));
  const operationValid = scoreOnly
    ? typeof request.score === "number" &&
      request.score > 0 &&
      request.score <= 10 &&
      Number.isSafeInteger(request.score * 10)
    : request.status === "COMPLETED" &&
      Number.isSafeInteger(request.progress) &&
      request.progress === request.expectedEpisodes;
  if (!commonValid || !operationValid)
    throw Error("Invalid or unsupported single-entry request");
}
let last = 0;
/** @param {string} query
 *  @param {Record<string, unknown>} [variables]
 *  @returns {Promise<any>} AniList GraphQL response data, validated at each call site.
 */
async function graphql(query, variables = {}) {
  const delay = Math.max(0, 2200 - (Date.now() - last));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  last = Date.now();
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });
  /** @type {{ errors?: Array<{ message: string }>, data?: any }} */
  const result = /** @type {any} */ (await response.json());
  if (!response.ok || result.errors?.length || !result.data) {
    throw Error(
      "AniList API error: " + (result.errors?.map((e) => e.message).join("; ") || response.status),
    );
  }
  return result.data;
}
const viewer = (await graphql("query { Viewer { id name } }")).Viewer;
if (!viewer?.id || viewer.name?.toLowerCase() !== "luciedmeo")
  throw Error("AniList account mismatch");
const mediaQuery = `query ($id:Int!) { Media(id:$id,type:ANIME) {
  id type format episodes title { romaji english }
  mediaListEntry { id status progress scoreRaw score(format:POINT_10_DECIMAL) notes repeat priority
    private hiddenFromStatusLists customLists(asArray:true) advancedScores
    startedAt { year month day } completedAt { year month day } }
} }`;
/** @param {AniRequest} request */
async function read(request) {
  return (await graphql(mediaQuery, { id: request.mediaId })).Media;
}
for (const request of requests) {
  const media = await read(request);
  const titles = [media?.title?.romaji, media?.title?.english].filter(Boolean);
  if (
    media?.id !== request.mediaId ||
    media.type !== "ANIME" ||
    media.episodes !== request.expectedEpisodes ||
    !titles.some((t) => t.toLowerCase() === request.expectedTitle.toLowerCase())
  ) {
    throw Error("Media identity or episode count mismatch");
  }
  const before = media.mediaListEntry;
  const scoreOnly = Object.hasOwn(request, "score");
  let changed;
  if (scoreOnly) {
    // Scoring an absent item would implicitly create a CURRENT list entry.
    // That is a distinct owner decision, so fail before any mutation.
    if (!before?.id) throw Error("Score-only request requires an existing list entry");
    const desiredRaw = Math.round(request.score * 10);
    changed = before.scoreRaw !== desiredRaw;
    if (changed) {
      const mutation = `mutation ($id:Int!,$scoreRaw:Int!) {
        SaveMediaListEntry(mediaId:$id,scoreRaw:$scoreRaw) {
          id mediaId scoreRaw
        }
      }`;
      const saved = (await graphql(mutation, { id: request.mediaId, scoreRaw: desiredRaw }))
        .SaveMediaListEntry;
      if (saved?.id !== before.id || saved.mediaId !== request.mediaId || saved.scoreRaw !== desiredRaw)
        throw Error("Unexpected score mutation response");
    }
  } else {
    if (before?.status === "REPEATING" || (before?.progress ?? 0) > request.progress)
      throw Error("Conflicting existing AniList state");
    changed = before?.status !== "COMPLETED" || before?.progress !== request.progress;
    if (changed) {
      const mutation = `mutation ($id:Int!,$progress:Int!) {
        SaveMediaListEntry(mediaId:$id,status:COMPLETED,progress:$progress) {
          id mediaId status progress
        }
      }`;
      const saved = (await graphql(mutation, {
        id: request.mediaId,
        progress: request.progress,
      })).SaveMediaListEntry;
      if (saved?.mediaId !== request.mediaId ||
          saved.status !== "COMPLETED" ||
          saved.progress !== request.progress)
        throw Error("Unexpected mutation response");
    }
  }

  const afterMedia = await read(request);
  if (afterMedia?.id !== request.mediaId)
    throw Error("Authenticated media readback mismatch");
  const after = afterMedia.mediaListEntry;
  if (!after ||
      (scoreOnly
        ? after.scoreRaw !== Math.round(request.score * 10)
        : after.status !== "COMPLETED" || after.progress !== request.progress))
    throw Error("Authenticated readback mismatch");
  if (before) {
    const preservedFields = scoreOnly
      ? ["id", "status", "progress", "notes", "repeat", "priority", "private",
         "hiddenFromStatusLists", "customLists", "advancedScores", "startedAt", "completedAt"]
      : ["id", "score", "scoreRaw", "notes", "repeat", "priority", "private",
         "hiddenFromStatusLists", "customLists", "advancedScores"];
    for (const field of preservedFields) {
      if (JSON.stringify(before[field]) !== JSON.stringify(after[field]))
        throw Error("Unexpected change to " + field);
    }
    if (!scoreOnly) {
      for (const field of ["startedAt", "completedAt"]) {
        if (before[field] && JSON.stringify(before[field]) !== JSON.stringify(after[field]))
          throw Error("Unexpected change to " + field);
      }
    }
  }
  console.log(
    "VERIFIED account=Luciedmeo mediaId=" +
      request.mediaId +
      (scoreOnly
        ? " score=" + request.score
        : " status=COMPLETED progress=" + request.progress) +
      " outcome=" +
      (changed ? "APPLIED" : "ALREADY_CORRECT"),
  );
}
