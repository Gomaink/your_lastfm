const axios = require("axios");
require('dotenv').config();

async function getLastFmUsername() {
  const response = await axios.get('https://ws.audioscrobbler.com/2.0/', {
    params: {
      method: 'user.getInfo',
      user: process.env.LASTFM_USERNAME,
      api_key: process.env.LASTFM_API_KEY,
      format: 'json'
    }
  });

  return response.data?.user?.name || 'Undefined';
}

module.exports = { getLastFmUsername };