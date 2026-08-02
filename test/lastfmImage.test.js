const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getLastFmImage,
  isLastFmPlaceholder,
  isUsableImageUrl,
  normalizeImageUrl
} = require("../src/utils/lastfmImage");

test("selects the highest-priority non-placeholder Last.fm image", () => {
  const image = getLastFmImage([
    { size: "small", "#text": "https://example.com/small.jpg" },
    { size: "large", "#text": "https://example.com/large.jpg" },
    { size: "extralarge", "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png" }
  ]);

  assert.equal(image, "https://example.com/large.jpg");
});

test("handles singular string and object image payloads", () => {
  assert.equal(
    getLastFmImage("http://userserve-ak.last.fm/serve/252/avatar.jpg"),
    "https://userserve-ak.last.fm/serve/252/avatar.jpg"
  );
  assert.equal(
    getLastFmImage({ size: "large", "#text": "https://example.com/object.jpg" }),
    "https://example.com/object.jpg"
  );
});

test("recognizes Last.fm generic artwork placeholders", () => {
  const albumPlaceholder = "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";
  const trackPlaceholder = "https://lastfm.freetls.fastly.net/i/u/128s/4128a6eb29f94943c9d206c08e625904.jpg";

  assert.equal(isLastFmPlaceholder(albumPlaceholder), true);
  assert.equal(isLastFmPlaceholder(trackPlaceholder), true);
  assert.equal(isUsableImageUrl(albumPlaceholder), false);
  assert.equal(getLastFmImage([{ size: "large", "#text": albumPlaceholder }]), null);
});

test("normalizes HTTP image URLs to HTTPS and rejects unsupported protocols", () => {
  assert.equal(
    normalizeImageUrl("http://lastfm.freetls.fastly.net/i/u/300x300/cover.png"),
    "https://lastfm.freetls.fastly.net/i/u/300x300/cover.png"
  );
  assert.equal(normalizeImageUrl("http://example.com/cover.png"), "http://example.com/cover.png");
  assert.equal(normalizeImageUrl("data:image/png;base64,abc"), null);
  assert.equal(normalizeImageUrl("javascript:alert(1)"), null);
});
