import { renderCover, initCoverUploads } from "./coverUploader.js";
const PLACEHOLDER_AVATAR = '/images/artist-placeholder.png';

function showLoading() {
  const loader = document.getElementById('global-loading-friends');
  if (loader) loader.style.display = 'flex';
}

function hideLoading() {
  const loader = document.getElementById('global-loading-friends');
  if (loader) loader.style.display = 'none';
}


export async function loadFriends() {
    const container = document.getElementById('friends-view');
    
    container.innerHTML = '<div class="text-center p-5">Loading friends list...</div>';
    
    try {
        const res = await fetch('/api/friends');
        const friends = await res.json();
        renderFriendsList(friends, container);
    } catch (err) {
        container.innerHTML = '<p class="text-danger text-center">Error loading friends.</p>';
    }
}

function renderFriendsList(friends, container) {
    container.innerHTML = `
        <h2 class="section-title mb-4 ps-3">Friends (${friends.length})</h2>
        <div class="friends-grid ps-3 pe-3">
             ${friends.map(friend => {
                const avatar = friend.image[2]['#text'] || PLACEHOLDER_AVATAR;
                return `
                <div class="friend-card shadow-sm" data-user="${friend.name}">
                    <img src="${avatar}" alt="${friend.name}" class="friend-avatar" onerror="this.src='${PLACEHOLDER_AVATAR}'">
                    <div class="friend-info">
                        <strong>${friend.name}</strong>
                    </div>
                </div>`;
            }).join('')}
        </div>
        <div id="comparison-container" class="d-none p-3"></div>
    `;

    document.querySelectorAll('.friend-card').forEach(card => {
        card.addEventListener('click', () => loadComparison(card.dataset.user));
    });
}

async function loadComparison(friendUsername) {
    const container = document.getElementById('comparison-container');
    const grid = document.querySelector('.friends-grid');
    const title = document.querySelector('.section-title');

    grid.classList.add('d-none');
    title.classList.add('d-none');
    
    container.classList.remove('d-none');
    container.innerHTML = '';
    showLoading();

    try {
        const res = await fetch(`/api/friends/compare/${friendUsername}`);
        const data = await res.json();
        
        hideLoading();
        renderComparison(data, container);
    } catch (err) {
        hideLoading();
        console.error(err);
        container.innerHTML = '<p class="text-danger">Error loading comparison.</p><button class="btn-back">Back</button>';
        container.querySelector('.btn-back').addEventListener('click', backToList);
    }
}

function renderComparison(data, container) {
    if (data.error) {
        container.innerHTML = `<p>${data.message}</p><button class="btn-back">Back</button>`;
        container.querySelector('.btn-back').addEventListener('click', backToList);
        return;
    }

    const { user, friend, commonArtists, commonAlbums, commonTracks, compatibilityScore } = data;
    const fmt = new Intl.NumberFormat('pt-BR').format;
    const compStatus = getCompatibilityStatus(compatibilityScore || 0);
    const myAvatarImg = document.querySelector('.profile-avatar img')?.src || PLACEHOLDER_AVATAR;

    const renderCommonItem = (item, type) => {
        const coverHTML = renderCover({
            image: item.image,
            artist: item.artist || item.name,
            album: item.name, 
            size: 'large'
        });

        return `
            <div class="common-item">
                <div class="common-img-wrap">
                    ${coverHTML}
                </div>
                <div class="common-info">
                    <strong>${item.name}</strong>
                    ${item.artist ? `<small>${item.artist}</small>` : ''}
                    <div class="common-counts">
                        <span class="text-orange">You: ${fmt(item.myPlays)}</span>
                        <span class="text-secondary"> | ${friend.username}: ${fmt(item.friendPlays)}</span>
                    </div>
                </div>
            </div>
        `;
    };

    container.innerHTML = `
        <button class="btn-back mb-4">← Back</button>

        <div class="comparison-header text-center">
            <h2>${user.username} <span class="text-muted fs-5">vs</span> ${friend.username}</h2>
            <div class="avatars-vs">
                <div class="vs-avatar-container">
                     <img src="${myAvatarImg}" class="vs-avatar">
                </div>
                <span>VS</span>
                <div class="vs-avatar-container" style="border-color: #555">
                    <img src="${friend.avatar}" class="vs-avatar" onerror="this.src='${PLACEHOLDER_AVATAR}'">
                </div>
            </div>
        </div>

        <div class="compatibility-result">
            <div class="compatibility-label">Compatibility Level</div>
            <div class="compatibility-status ${compStatus.css}">${compStatus.text}</div>
        </div>

        <div class="comparison-grid">
            <div class="comp-card">
                <span class="comp-card-title">Total Scrobbles</span>
                <div class="comp-card-values">
                    <span class="val-you">${fmt(user.scrobbles)}</span>
                    <span class="val-vs">vs</span>
                    <span class="val-friend">${fmt(friend.scrobbles)}</span>
                </div>
            </div>
            <div class="comp-card">
                <span class="comp-card-title">Total Albums</span>
                <div class="comp-card-values">
                    <span class="val-you">${fmt(user.albumsCount)}</span>
                    <span class="val-vs">vs</span>
                    <span class="val-friend">${fmt(friend.albumsCount)}</span>
                </div>
            </div>
        </div>

        <h3 class="mt-5 mb-4 text-center section-title">Common Interests</h3>

        <div class="row">
            <div class="col-md-4 mb-4">
                <h5 class="mb-3 text-uppercase fs-6 ls-1">Top Artists</h5>
                <div class="common-list-container">
                    ${commonArtists.length ? commonArtists.map(i => renderCommonItem(i, 'artist')).join('') : '<div class="p-3 text-muted">No artists in common in the top 50.</div>'}
                </div>
            </div>
            <div class="col-md-4 mb-4">
                <h5 class="mb-3 text-uppercase fs-6 ls-1">Top Albums</h5>
                <div class="common-list-container">
                    ${commonAlbums.length ? commonAlbums.map(i => renderCommonItem(i, 'album')).join('') : '<div class="p-3 text-muted">No albums in common in the top 50.</div>'}
                </div>
            </div>
            <div class="col-md-4 mb-4">
                <h5 class="mb-3 text-uppercase fs-6 ls-1">Top Tracks</h5>
                <div class="common-list-container">
                    ${commonTracks.length ? commonTracks.map(i => renderCommonItem(i, 'track')).join('') : '<div class="p-3 text-muted">No songs in common in the top 50.</div>'}
                </div>
            </div>
        </div>
    `;

    container.querySelector('.btn-back').addEventListener('click', backToList);
    
    initCoverUploads();
}

function backToList() {
    document.getElementById('comparison-container').classList.add('d-none');
    document.querySelector('.friends-grid').classList.remove('d-none');
    document.querySelector('.section-title').classList.remove('d-none');
}

function getCompatibilityStatus(score) {
    if (score >= 80) return { text: 'SUPER', css: 'super' };
    if (score >= 65) return { text: 'HIGH', css: 'high' };
    if (score >= 40) return { text: 'MEDIUM', css: 'medium' };
    if (score >= 20) return { text: 'LOW', css: 'low' };
    return { text: 'VERY LOW', css: 'very-low' };
}
