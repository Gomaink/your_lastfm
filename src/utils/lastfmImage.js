const LASTFM_PLACEHOLDER_PATTERNS = [
  "2a96cbd8b46e442fc41c2b86b821562f",
  "4128a6eb29f94943c9d206c08e625904"
];

const HTTPS_IMAGE_HOSTS = new Set([
  "lastfm.freetls.fastly.net",
  "lastfm-img2.akamaized.net",
  "img2-ak.lst.fm",
  "userserve-ak.last.fm",
  "cdn-images.dzcdn.net",
  "e-cdns-images.dzcdn.net"
]);

const IMAGE_SIZE_PRIORITY = new Map([
  ["mega", 6],
  ["extralarge", 5],
  ["large", 4],
  ["medium", 3],
  ["small", 2],
  ["", 1]
]);

function normalizeImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    // Last.fm's older API examples and some responses still use HTTP URLs.
    // Upgrade only known image CDNs, preserving arbitrary user-provided URLs.
    if (parsed.protocol === "http:" && HTTPS_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
      parsed.protocol = "https:";
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function isLastFmPlaceholder(value) {
  const url = String(value || "").toLowerCase();
  return LASTFM_PLACEHOLDER_PATTERNS.some(pattern => url.includes(pattern));
}

function isUsableImageUrl(value) {
  const url = normalizeImageUrl(value);
  return Boolean(url && !isLastFmPlaceholder(url));
}

function getImageEntryUrl(entry) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return null;
  return entry["#text"] || entry.url || entry.src || null;
}

function getLastFmImage(images, options = {}) {
  const allowPlaceholder = options.allowPlaceholder === true;
  const entries = Array.isArray(images) ? images : images ? [images] : [];

  return entries
    .map((entry, index) => ({
      url: normalizeImageUrl(getImageEntryUrl(entry)),
      priority: IMAGE_SIZE_PRIORITY.get(String(entry?.size || "").toLowerCase()) || 0,
      index
    }))
    .filter(item => item.url && (allowPlaceholder || !isLastFmPlaceholder(item.url)))
    .sort((a, b) => b.priority - a.priority || b.index - a.index)[0]?.url || null;
}

module.exports = {
  LASTFM_PLACEHOLDER_PATTERNS,
  getLastFmImage,
  isLastFmPlaceholder,
  isUsableImageUrl,
  normalizeImageUrl
};
