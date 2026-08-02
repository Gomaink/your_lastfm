function encodePathSegment(value) {
  return encodeURIComponent(String(value || "").trim()).replace(/%20/g, "+");
}

function buildLastFmUrl(...segments) {
  const safeSegments = segments.map(encodePathSegment);
  if (safeSegments.some(segment => !segment)) return null;
  return `https://www.last.fm/music/${safeSegments.join("/")}`;
}

function getArtistUrl(artist) {
  return buildLastFmUrl(artist);
}

function getAlbumUrl(artist, album) {
  return buildLastFmUrl(artist, album);
}

function getTrackUrl(artist, track) {
  return buildLastFmUrl(artist, "_", track);
}

module.exports = { getArtistUrl, getAlbumUrl, getTrackUrl };
