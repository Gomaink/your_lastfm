import { fetchJSON } from "./api.js";
import {
  escapeAttribute,
  escapeHTML,
  installImageFallbacks,
  safeImageUrl
} from "./dom.js";

const PLACEHOLDER_AVATAR = "/images/artist-placeholder.png";
const PLACEHOLDER_COVER = "/images/cover-placeholder.svg";

function showLoading() {
  const loader = document.getElementById("global-loading-friends");
  if (loader) loader.style.display = "flex";
}

function hideLoading() {
  const loader = document.getElementById("global-loading-friends");
  if (loader) loader.style.display = "none";
}

export async function loadFriends() {
  const container = document.getElementById("friends-view");
  container.innerHTML = '<div class="text-center p-5">Loading friends list...</div>';

  try {
    const friends = await fetchJSON("/api/friends", { cache: "no-store" });
    renderFriendsList(friends, container);
  } catch (error) {
    container.innerHTML = `<p class="text-danger text-center">${escapeHTML(error.message)}</p>`;
  }
}

function renderFriendsList(friends, container) {
  container.innerHTML = `
    <h2 class="section-title mb-4 ps-3">Friends (${friends.length})</h2>
    <div class="friends-grid ps-3 pe-3">
      ${friends.map(friend => {
        const avatar = safeImageUrl(friend.avatar, PLACEHOLDER_AVATAR);
        return `
          <button class="friend-card shadow-sm" data-user="${escapeAttribute(friend.name)}" type="button">
            <img
              src="${escapeAttribute(avatar)}"
              data-fallback="${PLACEHOLDER_AVATAR}"
              alt="${escapeAttribute(friend.name)}"
              class="friend-avatar"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
            />
            <div class="friend-info">
              <strong>${escapeHTML(friend.name)}</strong>
            </div>
          </button>
        `;
      }).join("")}
    </div>
    <div id="comparison-container" class="d-none p-3"></div>
  `;

  installImageFallbacks(container);

  container.querySelectorAll(".friend-card").forEach(card => {
    card.addEventListener("click", () => loadComparison(card.dataset.user));
  });
}

async function loadComparison(friendUsername) {
  const view = document.getElementById("friends-view");
  const container = document.getElementById("comparison-container");
  const grid = view.querySelector(".friends-grid");
  const title = view.querySelector(".section-title");

  grid?.classList.add("d-none");
  title?.classList.add("d-none");
  container.classList.remove("d-none");
  container.innerHTML = "";
  showLoading();

  try {
    const data = await fetchJSON(`/api/friends/compare/${encodeURIComponent(friendUsername)}`, {
      cache: "no-store"
    });
    renderComparison(data, container);
  } catch (error) {
    container.innerHTML = `
      <p class="text-danger">${escapeHTML(error.message)}</p>
      <button class="btn-back" type="button">Back</button>
    `;
    container.querySelector(".btn-back")?.addEventListener("click", backToList);
  } finally {
    hideLoading();
  }
}

function renderCommonItem(item, friendUsername) {
  return `
    <div class="common-item">
      <div class="common-img-wrap">
        <img
          src="${escapeAttribute(safeImageUrl(item.image, PLACEHOLDER_COVER))}"
          data-fallback="${PLACEHOLDER_COVER}"
          alt="${escapeAttribute(item.name)}"
          class="cover-img"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
        />
      </div>
      <div class="common-info">
        <strong>${escapeHTML(item.name)}</strong>
        ${item.artist ? `<small>${escapeHTML(item.artist)}</small>` : ""}
        <div class="common-counts">
          <span class="text-orange">You: ${Number(item.myPlays).toLocaleString("pt-BR")}</span>
          <span class="text-secondary"> | ${escapeHTML(friendUsername)}: ${Number(item.friendPlays).toLocaleString("pt-BR")}</span>
        </div>
      </div>
    </div>
  `;
}

function renderComparison(data, container) {
  const { user, friend, commonArtists, commonAlbums, commonTracks, compatibilityScore } = data;
  const format = number => new Intl.NumberFormat("pt-BR").format(number || 0);
  const compatibility = getCompatibilityStatus(compatibilityScore || 0);
  const myAvatar = safeImageUrl(
    document.querySelector(".profile-avatar img")?.src,
    PLACEHOLDER_AVATAR
  );

  container.innerHTML = `
    <button class="btn-back mb-4" type="button">← Back</button>

    <div class="comparison-header text-center">
      <h2>${escapeHTML(user.username)} <span class="text-muted fs-5">vs</span> ${escapeHTML(friend.username)}</h2>
      <div class="avatars-vs">
        <div class="vs-avatar-container">
          <img
            src="${escapeAttribute(myAvatar)}"
            data-fallback="${PLACEHOLDER_AVATAR}"
            class="vs-avatar"
            alt="Your avatar"
            decoding="async"
            referrerpolicy="no-referrer"
          />
        </div>
        <span>VS</span>
        <div class="vs-avatar-container" style="border-color: #555">
          <img
            src="${escapeAttribute(safeImageUrl(friend.avatar, PLACEHOLDER_AVATAR))}"
            data-fallback="${PLACEHOLDER_AVATAR}"
            class="vs-avatar"
            alt="${escapeAttribute(friend.username)}"
            decoding="async"
            referrerpolicy="no-referrer"
          />
        </div>
      </div>
    </div>

    <div class="compatibility-result">
      <div class="compatibility-label">Compatibility Level</div>
      <div class="compatibility-status ${compatibility.css}">${compatibility.text}</div>
    </div>

    <div class="comparison-grid">
      <div class="comp-card">
        <span class="comp-card-title">Total Scrobbles</span>
        <div class="comp-card-values">
          <span class="val-you">${format(user.scrobbles)}</span>
          <span class="val-vs">vs</span>
          <span class="val-friend">${format(friend.scrobbles)}</span>
        </div>
      </div>
      <div class="comp-card">
        <span class="comp-card-title">Total Albums</span>
        <div class="comp-card-values">
          <span class="val-you">${format(user.albumsCount)}</span>
          <span class="val-vs">vs</span>
          <span class="val-friend">${format(friend.albumsCount)}</span>
        </div>
      </div>
    </div>

    <h3 class="mt-5 mb-4 text-center section-title">Common Interests</h3>

    <div class="row">
      <div class="col-md-4 mb-4">
        <h5 class="mb-3 text-uppercase fs-6 ls-1">Top Artists</h5>
        <div class="common-list-container">
          ${commonArtists.length
            ? commonArtists.map(item => renderCommonItem(item, friend.username)).join("")
            : '<div class="p-3 text-muted">No artists in common in the top 50.</div>'}
        </div>
      </div>
      <div class="col-md-4 mb-4">
        <h5 class="mb-3 text-uppercase fs-6 ls-1">Top Albums</h5>
        <div class="common-list-container">
          ${commonAlbums.length
            ? commonAlbums.map(item => renderCommonItem(item, friend.username)).join("")
            : '<div class="p-3 text-muted">No albums in common in the top 50.</div>'}
        </div>
      </div>
      <div class="col-md-4 mb-4">
        <h5 class="mb-3 text-uppercase fs-6 ls-1">Top Tracks</h5>
        <div class="common-list-container">
          ${commonTracks.length
            ? commonTracks.map(item => renderCommonItem(item, friend.username)).join("")
            : '<div class="p-3 text-muted">No songs in common in the top 50.</div>'}
        </div>
      </div>
    </div>
  `;

  installImageFallbacks(container);
  container.querySelector(".btn-back")?.addEventListener("click", backToList);
}

function backToList() {
  const view = document.getElementById("friends-view");
  document.getElementById("comparison-container")?.classList.add("d-none");
  view.querySelector(".friends-grid")?.classList.remove("d-none");
  view.querySelector("h2.section-title")?.classList.remove("d-none");
}

function getCompatibilityStatus(score) {
  if (score >= 80) return { text: "SUPER", css: "comp-soulmates" };
  if (score >= 65) return { text: "HIGH", css: "comp-high" };
  if (score >= 40) return { text: "MEDIUM", css: "comp-medium" };
  if (score >= 20) return { text: "LOW", css: "comp-low" };
  return { text: "VERY LOW", css: "comp-low" };
}
