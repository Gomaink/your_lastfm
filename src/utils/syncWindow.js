function toNonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseSyncCheckpoint(value) {
  if (!value) return null;

  try {
    const checkpoint = typeof value === "string" ? JSON.parse(value) : value;
    const mode = checkpoint?.mode;
    const from = toNonNegativeInteger(checkpoint?.from);
    const to = toNonNegativeInteger(checkpoint?.to);

    if ((mode !== "full" && mode !== "incremental") || from === null || to === null) {
      return null;
    }

    if (from > to || (mode === "full" && from !== 0)) return null;

    return { mode, from, to };
  } catch {
    return null;
  }
}

function resolveSyncWindow({
  full = false,
  currentTimestamp,
  lastPlayedAt = 0,
  overlapSeconds = 0,
  checkpoint = null
}) {
  const now = toNonNegativeInteger(currentTimestamp);
  if (now === null || now === 0) throw new Error("currentTimestamp must be a positive UNIX timestamp");

  const savedCheckpoint = parseSyncCheckpoint(checkpoint);

  // A manual/full request intentionally replaces an unfinished incremental window.
  // Otherwise, preserve both boundaries so a failed page cannot create a permanent gap.
  if (!full && savedCheckpoint) {
    return {
      ...savedCheckpoint,
      resumed: true
    };
  }

  const latest = toNonNegativeInteger(lastPlayedAt) || 0;
  const overlap = toNonNegativeInteger(overlapSeconds) || 0;
  const mode = full ? "full" : "incremental";

  return {
    mode,
    from: full ? 0 : Math.max(0, latest - overlap),
    to: now,
    resumed: false
  };
}

module.exports = { parseSyncCheckpoint, resolveSyncWindow };
