const test = require("node:test");
const assert = require("node:assert/strict");

const {
  aggregateMemberCharts,
  normalizeChartItems,
  normalizeGroupInput
} = require("../src/utils/leaderboard");

test("normalizes Last.fm weekly artist, album, and track chart shapes", () => {
  assert.deepEqual(normalizeChartItems("artists", {
    name: "Radiohead",
    playcount: "12",
    url: "https://www.last.fm/music/Radiohead"
  }), [{
    key: "radiohead",
    name: "Radiohead",
    artist: null,
    playcount: 12,
    url: "https://www.last.fm/music/Radiohead",
    mbid: null
  }]);

  const albums = normalizeChartItems("albums", [{
    name: "Vespertine",
    artist: { "#text": "Björk" },
    playcount: "8"
  }]);
  assert.equal(albums[0].artist, "Björk");
  assert.equal(albums[0].key, "björk\u0000vespertine");

  const tracks = normalizeChartItems("tracks", [{
    name: "Jóga",
    artist: "Björk",
    playcount: "4"
  }]);
  assert.equal(tracks[0].artist, "Björk");
  assert.equal(tracks[0].playcount, 4);
});

test("aggregates case-insensitive group charts and preserves contributions", () => {
  const charts = [
    {
      username: "samuel",
      profile: { username: "samuel", avatar: "/samuel.png" },
      items: normalizeChartItems("artists", [
        { name: "Radiohead", playcount: "12" },
        { name: "Björk", playcount: "4" }
      ])
    },
    {
      username: "friend",
      profile: { username: "friend", avatar: "/friend.png" },
      items: normalizeChartItems("artists", [
        { name: "radiohead", playcount: "7" },
        { name: "Portishead", playcount: "8" }
      ])
    }
  ];

  const result = aggregateMemberCharts("artists", charts, 10);
  assert.equal(result.totalScrobbles, 31);
  assert.equal(result.members[0].username, "samuel");
  assert.equal(result.members[0].scrobbles, 16);
  assert.equal(result.items[0].name, "Radiohead");
  assert.equal(result.items[0].plays, 19);
  assert.equal(result.items[0].listeners, 2);
  assert.deepEqual(result.items[0].contributions, [
    { username: "samuel", plays: 12 },
    { username: "friend", plays: 7 }
  ]);
});

test("keeps failed members in the ranking without affecting totals", () => {
  const result = aggregateMemberCharts("tracks", [
    {
      username: "available",
      profile: { username: "available" },
      items: normalizeChartItems("tracks", [{
        name: "Track",
        artist: "Artist",
        playcount: "3"
      }])
    },
    {
      username: "offline",
      profile: { username: "offline" },
      error: "Temporary Last.fm error",
      items: []
    }
  ]);

  assert.equal(result.totalScrobbles, 3);
  assert.equal(result.members.length, 2);
  assert.equal(result.members[1].error, "Temporary Last.fm error");
});

test("normalizes group members and rejects invalid group payloads", () => {
  assert.deepEqual(normalizeGroupInput({
    name: "  Friends  ",
    members: ["Samuel", "friend", "samuel"]
  }), {
    name: "Friends",
    members: ["Samuel", "friend"]
  });

  assert.throws(
    () => normalizeGroupInput({ name: "Solo", members: ["Samuel"] }),
    /at least 2 members/
  );
  assert.throws(
    () => normalizeGroupInput({ name: "Bad", members: ["valid", "has space"] }),
    /Invalid Last.fm username/
  );
});
