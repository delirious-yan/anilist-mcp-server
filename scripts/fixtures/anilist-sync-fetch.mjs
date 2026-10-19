// @ts-check
// Synthetic responses mirror the fields selected by sync-anilist-request.mjs.
// No network fallback: every fetch must consume a declared fixture response.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

/** @type {{ responses: any[], tracePath: string }} */
const fixture = JSON.parse(readFileSync(String(process.env.ANILIST_SYNC_FIXTURE), "utf8"));
/** @type {Array<{ query: string, variables: Record<string, unknown> }>} */
const trace = [];
// Skip only the CLI's pacing delay; timeout behavior is outside this fixture suite.
let clock = 0;
Date.now = () => (clock += 3000);
globalThis.fetch = async (input, init) => {
  assert.equal(input, "https://graphql.anilist.co");
  assert.equal(init?.method, "POST");
  const call = JSON.parse(String(init?.body));
  trace.push(call);
  writeFileSync(fixture.tracePath, JSON.stringify(trace));
  assert.ok(fixture.responses.length, "Unexpected GraphQL call; no network allowed");
  const next = fixture.responses.shift();
  return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
};
