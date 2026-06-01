const axios = require('axios');
const db = require('./db');
const { sync } = require('./sync');

async function verifyIntegrity() {
    const response = await axios.get(
        'https://ws.audioscrobbler.com/2.0/',
        {
            params: {
                method: 'user.getInfo',
                user: process.env.LASTFM_USERNAME,
                api_key: process.env.LASTFM_API_KEY,
                format: 'json'
            }
        }
    );

    const lastfmCount =
        parseInt(response.data.user.playcount);

    const localCount =
        db.prepare(
            'SELECT COUNT(*) as c FROM scrobbles'
        ).get().c;

    const diff =
        Math.abs(lastfmCount - localCount);

    console.log(
        `[Integrity] LastFM=${lastfmCount} Local=${localCount} Diff=${diff}`
    );

    if (diff > 25) {
        console.log(
            '[Integrity] Difference detected, running full sync'
        );

        await sync({ full: true });
    }
}

module.exports = {
    verifyIntegrity
};