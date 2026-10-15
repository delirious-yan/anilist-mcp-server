import { readFileSync } from 'node:fs';
const token = process.env.ANILIST_ACCESS_TOKEN;
if (!token) throw Error('AniList token secret unavailable');
const request = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!Number.isSafeInteger(request.mediaId) || request.mediaId < 1 ||
    request.status !== 'COMPLETED' || !Number.isSafeInteger(request.progress) ||
    request.progress < 1 || typeof request.expectedTitle !== 'string' ||
    request.expectedTitle.length < 3 || request.expectedTitle.length > 120 ||
    !Number.isSafeInteger(request.expectedEpisodes) ||
    request.expectedEpisodes !== request.progress) {
  throw Error('Invalid or unsupported single-entry request');
}
let last = 0;
async function graphql(query, variables = {}) {
  const delay = Math.max(0, 2200 - (Date.now() - last));
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  last = Date.now();
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data) {
    throw Error('AniList API error: ' + (result.errors?.map(e => e.message).join('; ') || response.status));
  }
  return result.data;
}
const viewer = (await graphql('query { Viewer { id name } }')).Viewer;
if (!viewer?.id || viewer.name?.toLowerCase() !== 'luciedmeo') throw Error('AniList account mismatch');
const mediaQuery = `query ($id:Int!) { Media(id:$id,type:ANIME) {
  id type format episodes title { romaji english }
  mediaListEntry { id status progress score(format:POINT_10_DECIMAL) notes repeat priority
    private hiddenFromStatusLists customLists(asArray:true) advancedScores
    startedAt { year month day } completedAt { year month day } }
} }`;
async function read() { return (await graphql(mediaQuery, { id: request.mediaId })).Media; }
const media = await read();
const titles = [media?.title?.romaji, media?.title?.english].filter(Boolean);
if (media?.id !== request.mediaId || media.type !== 'ANIME' ||
    media.episodes !== request.expectedEpisodes ||
    !titles.some(t => t.toLowerCase() === request.expectedTitle.toLowerCase())) {
  throw Error('Media identity or episode count mismatch');
}
const before = media.mediaListEntry;
if (before?.status === 'REPEATING' || (before?.progress ?? 0) > request.progress)
  throw Error('Conflicting existing AniList state');
if (before?.status !== 'COMPLETED' || before?.progress !== request.progress) {
  const mutation = `mutation ($id:Int!,$progress:Int!) {
    SaveMediaListEntry(mediaId:$id,status:COMPLETED,progress:$progress) {
      id mediaId status progress
    }
  }`;
  const saved = (await graphql(mutation, {
    id: request.mediaId, progress: request.progress
  })).SaveMediaListEntry;
  if (saved?.mediaId !== request.mediaId || saved.status !== 'COMPLETED' ||
      saved.progress !== request.progress) throw Error('Unexpected mutation response');
}
const after = (await read()).mediaListEntry;
if (!after || after.status !== 'COMPLETED' || after.progress !== request.progress)
  throw Error('Authenticated readback mismatch');
if (before) {
  for (const field of ['id','score','notes','repeat','priority','private',
    'hiddenFromStatusLists','customLists','advancedScores']) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      throw Error('Unexpected change to ' + field);
  }
  for (const field of ['startedAt','completedAt']) {
    if (before[field] && JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      throw Error('Unexpected change to ' + field);
  }
}
console.log('VERIFIED account=Luciedmeo mediaId=' + request.mediaId +
  ' status=COMPLETED progress=' + request.progress);
