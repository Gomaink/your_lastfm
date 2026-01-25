require('dotenv').config();
const axios = require("axios");
const db = require('../db');

const { getDeezerAlbumImage } = require('./deezer-album'); 
const { fetchArtistImage } = require('./deezerArtistImage');

const API_KEY = process.env.LASTFM_API_KEY;
const MAIN_USER = process.env.LASTFM_USERNAME;
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
const PLACEHOLDER_IMG = '/images/artist-placeholder.png';

const normalize = (l) => {
    if (!l) return [];
    return Array.isArray(l) ? l : [l];
};

const getApiImage = (imageArray) => {
    if (!Array.isArray(imageArray) || imageArray.length === 0) return null;
    return imageArray[3]?.['#text'] || imageArray[2]?.['#text'] || imageArray[1]?.['#text'] || null;
};

async function findBestImage(db, type, name, artistName, apiImageArray) {
    let localImage = null;

    try {
        if (type === 'artist') {
            const row = db.prepare(`
                SELECT album_image FROM scrobbles 
                WHERE lower(artist) = lower(?) AND album_image IS NOT NULL AND album_image != ''
                ORDER BY played_at DESC LIMIT 1
            `).get(name);
            localImage = row?.album_image;
        } 
        else if (type === 'album' || type === 'track') {
            const query = type === 'album' 
                ? "SELECT album_image FROM scrobbles WHERE lower(album) = lower(?) AND lower(artist) = lower(?) LIMIT 1"
                : "SELECT album_image FROM scrobbles WHERE lower(track) = lower(?) AND lower(artist) = lower(?) LIMIT 1";
            
            const row = db.prepare(query).get(name, artistName);
            localImage = row?.album_image;
        }

        if (localImage) return localImage;

        if (type === 'artist') {
            const deezerImg = await fetchArtistImage(name);
            if (deezerImg) return deezerImg;
        } 
        else {
            const deezerImg = await getDeezerAlbumImage(artistName, name);
            if (deezerImg) return deezerImg;
        }

    } catch (e) {
        console.error(`Error fetching image (${type}):`, e.message);
    }

    const apiImg = getApiImage(apiImageArray);
    if (apiImg) return apiImg;

    if (artistName) {
        try {
            const artistImg = await fetchArtistImage(artistName);
            if (artistImg) return artistImg;
        } catch (e) {}
    }

    return PLACEHOLDER_IMG;
}

function calculateCompatibilityScore(commonArtists, commonAlbums, commonTracks, myTotalArtists, friendTotalArtists) {
    
    const maxArtists = Math.max(10, Math.min(myTotalArtists, friendTotalArtists)); 

    const artistScore = Math.min(50, (commonArtists.length / 10) * 50);
    const albumScore = Math.min(30, (commonAlbums.length / 5) * 30);
    const trackScore = Math.min(20, (commonTracks.length / 5) * 20);

    let total = artistScore + albumScore + trackScore;

    if (commonArtists.length > 20) total += 5;

    return Math.round(Math.min(100, total));
}

async function getFriendsList(limit = 50) {
    try {
        const response = await axios.get(BASE_URL, {
            params: { method: 'user.getFriends', user: MAIN_USER, api_key: API_KEY, limit, format: 'json' }
        });
        return response.data?.friends?.user || [];
    } catch (error) {
        console.error("Erro getFriendsList:", error.message);
        return [];
    }
}

async function compareWithFriend(db, friendUsername) {
    try {
        const params = { user: friendUsername, api_key: API_KEY, limit: 50, format: 'json' };

        const [infoRes, artistsRes, albumsRes, tracksRes] = await Promise.all([
            axios.get(BASE_URL, { params: { ...params, method: 'user.getInfo' } }),
            axios.get(BASE_URL, { params: { ...params, method: 'user.getTopArtists' } }),
            axios.get(BASE_URL, { params: { ...params, method: 'user.getTopAlbums' } }),
            axios.get(BASE_URL, { params: { ...params, method: 'user.getTopTracks' } })
        ]);

        const friendData = infoRes.data.user;
        const fArtists = normalize(artistsRes.data?.topartists?.artist);
        const fAlbums = normalize(albumsRes.data?.topalbums?.album);
        const fTracks = normalize(tracksRes.data?.toptracks?.track);

        const friendTotalArtists = parseInt(artistsRes.data?.topartists?.['@attr']?.total || 0);
        const friendTotalAlbums = parseInt(albumsRes.data?.topalbums?.['@attr']?.total || 0);

        const commonArtists = [];
        const stmtMyArtistPlays = db.prepare("SELECT COUNT(*) as c FROM scrobbles WHERE lower(artist) = lower(?)");

        for (const a of fArtists) {
            const myPlays = stmtMyArtistPlays.get(a.name)?.c || 0;
            if (myPlays > 0) {
                const img = await findBestImage(db, 'artist', a.name, null, a.image);
                commonArtists.push({
                    name: a.name,
                    myPlays,
                    friendPlays: parseInt(a.playcount),
                    image: img
                });
            }
        }
        commonArtists.sort((a, b) => b.myPlays - a.myPlays);

        const commonAlbums = [];
        const stmtMyAlbumPlays = db.prepare("SELECT COUNT(*) as c FROM scrobbles WHERE lower(album) = lower(?) AND lower(artist) = lower(?)");

        for (const alb of fAlbums) {
            const myPlays = stmtMyAlbumPlays.get(alb.name, alb.artist.name)?.c || 0;
            if (myPlays > 0) {
                const img = await findBestImage(db, 'album', alb.name, alb.artist.name, alb.image);
                commonAlbums.push({
                    name: alb.name,
                    artist: alb.artist.name,
                    myPlays,
                    friendPlays: parseInt(alb.playcount),
                    image: img
                });
            }
        }

        const commonTracks = [];
        const stmtMyTrackPlays = db.prepare("SELECT COUNT(*) as c FROM scrobbles WHERE lower(track) = lower(?) AND lower(artist) = lower(?)");

        for (const trk of fTracks) {
            const myPlays = stmtMyTrackPlays.get(trk.name, trk.artist.name)?.c || 0;
            if (myPlays > 0) {
                const img = await findBestImage(db, 'track', trk.name, trk.artist.name, trk.image);
                commonTracks.push({
                    name: trk.name,
                    artist: trk.artist.name,
                    myPlays,
                    friendPlays: parseInt(trk.playcount),
                    image: img
                });
            }
        }

        const myStats = {
            scrobbles: db.prepare("SELECT COUNT(*) as c FROM scrobbles").get()?.c || 0,
            albumsCount: db.prepare("SELECT COUNT(DISTINCT album) as c FROM scrobbles WHERE album != ''").get()?.c || 0,
            artistsCount: db.prepare("SELECT COUNT(DISTINCT artist) as c FROM scrobbles").get()?.c || 0
        };

        const compatibilityScore = calculateCompatibilityScore(
            commonArtists, 
            commonAlbums, 
            commonTracks, 
            myStats.artistsCount, 
            friendTotalArtists
        );

        return {
            user: { 
                username: "You", 
                scrobbles: myStats.scrobbles,
                albumsCount: myStats.albumsCount
            },
            friend: {
                username: friendData.name,
                avatar: getApiImage(friendData.image) || PLACEHOLDER_IMG,
                scrobbles: parseInt(friendData.playcount || 0),
                albumsCount: friendTotalAlbums,
                url: friendData.url
            },
            compatibilityScore: compatibilityScore,
            
            commonArtists: commonArtists.slice(0, 5),
            commonAlbums: commonAlbums.slice(0, 5),
            commonTracks: commonTracks.slice(0, 5)
        };

    } catch (err) {
        console.error("Erro compareWithFriend:", err);
        return { error: true, message: 'Error comparing profiles. Please try again.' };
    }
}

module.exports = { getFriendsList, compareWithFriend };