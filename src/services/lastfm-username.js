const axios = require("axios");
require('dotenv').config();

async function getLastFmUserInfo() {
  try {
    const response = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      params: {
        method: 'user.getInfo',
        user: process.env.LASTFM_USERNAME,
        api_key: process.env.LASTFM_API_KEY,
        format: 'json'
      }
    });

    const user = response.data?.user;

    if (!user) {
        return { name: process.env.LASTFM_USERNAME, avatar: null };
    }

    const images = user.image;
    const avatarObj = images.find(img => img.size === 'extralarge') || images.find(img => img.size === 'large');
    const avatarUrl = avatarObj ? avatarObj['#text'] : null;

    return {
      name: user.name,
      avatar: avatarUrl
    };

  } catch (error) {
    console.error("Error getting data from Last.fm:", error.message);
    return { name: process.env.LASTFM_USERNAME || 'User', avatar: null };
  }
}

module.exports = { getLastFmUserInfo };