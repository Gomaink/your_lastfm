const axios = require("axios");
const { fetchWithRetry } = require("../utils/fetchRetry");
const { normalizeImageUrl } = require("../utils/lastfmImage");

const DEEZER_SEARCH_URL = "https://api.deezer.com/search/track";
const REQUEST_TIMEOUT = Number(process.env.IMAGE_REQUEST_TIMEOUT_MS || 10000);

const normalize = value => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\b(remaster(?:ed)?|deluxe|edition|version|explicit|clean|live)\b/gi, " ")
  .replace(/[^a-z0-9]+/gi, " ")
  .trim()
  .toLocaleLowerCase();

function isReasonableMatch(actual, expected) {
  if (!actual || !expected) return false;
  return actual === expected || actual.includes(expected) || expected.includes(actual);
}

async function getDeezerTrackImage(artist, track) {
  try {
    const query = `artist:"${artist}" track:"${track}"`;
    const { data } = await fetchWithRetry(() =>
      axios.get(DEEZER_SEARCH_URL, {
        timeout: REQUEST_TIMEOUT,
        params: { q: query, limit: 5 }
      }),
      2,
      500
    );

    const expectedArtist = normalize(artist);
    const expectedTrack = normalize(track);
    const items = Array.isArray(data?.data) ? data.data : [];
    const match = items.find(item => (
      isReasonableMatch(normalize(item.artist?.name), expectedArtist)
      && isReasonableMatch(normalize(item.title_short || item.title), expectedTrack)
    ));

    return normalizeImageUrl(
      match?.album?.cover_xl
      || match?.album?.cover_big
      || match?.album?.cover_medium
      || match?.album?.cover
    );
  } catch {
    return null;
  }
}

module.exports = { getDeezerTrackImage };
