const axios = require("axios");
const qs = require("qs");

async function fetchDeezerArtistImage(artist) {

  const res = await axios.get(`https://api.deezer.com/search/artist?q=${artist}&limit=1`
  );

  item = res.data?.data?.[0].picture;

  if (!item) return null;
  else return item;
}

module.exports = { fetchDeezerArtistImage };
