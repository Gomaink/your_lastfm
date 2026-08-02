const test = require("node:test");
const assert = require("node:assert/strict");

const { parseSyncCheckpoint, resolveSyncWindow } = require("../src/utils/syncWindow");

test("creates an overlapping incremental window", () => {
  assert.deepEqual(resolveSyncWindow({
    currentTimestamp: 200000,
    lastPlayedAt: 180000,
    overlapSeconds: 86400
  }), {
    mode: "incremental",
    from: 93600,
    to: 200000,
    resumed: false
  });
});

test("resumes the exact failed window instead of advancing past missing pages", () => {
  assert.deepEqual(resolveSyncWindow({
    currentTimestamp: 300000,
    lastPlayedAt: 290000,
    overlapSeconds: 86400,
    checkpoint: JSON.stringify({
      mode: "incremental",
      from: 120000,
      to: 200000
    })
  }), {
    mode: "incremental",
    from: 120000,
    to: 200000,
    resumed: true
  });
});

test("resumes an interrupted full sync on the next scheduled run", () => {
  assert.deepEqual(resolveSyncWindow({
    currentTimestamp: 300000,
    lastPlayedAt: 250000,
    overlapSeconds: 86400,
    checkpoint: { mode: "full", from: 0, to: 200000 }
  }), {
    mode: "full",
    from: 0,
    to: 200000,
    resumed: true
  });
});

test("a requested full sync replaces an older checkpoint", () => {
  assert.deepEqual(resolveSyncWindow({
    full: true,
    currentTimestamp: 300000,
    lastPlayedAt: 250000,
    overlapSeconds: 86400,
    checkpoint: { mode: "incremental", from: 120000, to: 200000 }
  }), {
    mode: "full",
    from: 0,
    to: 300000,
    resumed: false
  });
});

test("rejects malformed checkpoints", () => {
  assert.equal(parseSyncCheckpoint("not-json"), null);
  assert.equal(parseSyncCheckpoint({ mode: "full", from: 1, to: 2 }), null);
  assert.equal(parseSyncCheckpoint({ mode: "incremental", from: 3, to: 2 }), null);
});
