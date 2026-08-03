import { fetchJSON } from "./api.js";
import {
  escapeAttribute,
  escapeHTML,
  installImageFallbacks,
  safeImageUrl
} from "./dom.js";

const AVATAR_PLACEHOLDER = "/images/artist-placeholder.png";
const COVER_PLACEHOLDER = "/images/cover-placeholder.svg";
const numberFormat = new Intl.NumberFormat("en-US");
const LEADERBOARD_TYPES = new Set(["artists", "albums", "tracks"]);

const UI = {
  view: document.getElementById("leaderboards-view"),
  newGroup: document.getElementById("leaderboard-new-group"),
  emptyCreate: document.querySelector(".leaderboard-empty-create"),
  groupCount: document.getElementById("leaderboard-group-count"),
  groupsList: document.getElementById("leaderboard-groups-list"),
  empty: document.getElementById("leaderboard-empty"),
  content: document.getElementById("leaderboard-content"),
  groupName: document.getElementById("leaderboard-group-name"),
  groupMembersLabel: document.getElementById("leaderboard-group-members-label"),
  editGroup: document.getElementById("leaderboard-edit-group"),
  deleteGroup: document.getElementById("leaderboard-delete-group"),
  from: document.getElementById("leaderboard-from"),
  to: document.getElementById("leaderboard-to"),
  presets: document.querySelectorAll(".leaderboard-preset"),
  types: document.querySelectorAll(".leaderboard-type"),
  apply: document.getElementById("leaderboard-apply"),
  refresh: document.getElementById("leaderboard-refresh"),
  status: document.getElementById("leaderboard-status"),
  loading: document.getElementById("leaderboard-loading"),
  error: document.getElementById("leaderboard-error"),
  results: document.getElementById("leaderboard-results"),
  totalScrobbles: document.getElementById("leaderboard-total-scrobbles"),
  activeMembers: document.getElementById("leaderboard-active-members"),
  currentLeader: document.getElementById("leaderboard-current-leader"),
  memberRanking: document.getElementById("leaderboard-member-ranking"),
  itemsTitle: document.getElementById("leaderboard-items-title"),
  cacheState: document.getElementById("leaderboard-cache-state"),
  items: document.getElementById("leaderboard-items"),
  groupModalElement: document.getElementById("leaderboard-group-modal"),
  groupModalTitle: document.getElementById("leaderboard-group-modal-title"),
  groupForm: document.getElementById("leaderboard-group-form"),
  groupNameInput: document.getElementById("leaderboard-group-name-input"),
  memberInput: document.getElementById("leaderboard-member-input"),
  memberChips: document.getElementById("leaderboard-member-chips"),
  memberLimit: document.getElementById("leaderboard-member-limit"),
  addMember: document.getElementById("leaderboard-add-member"),
  addMe: document.getElementById("leaderboard-add-me"),
  formError: document.getElementById("leaderboard-group-form-error"),
  saveGroup: document.getElementById("leaderboard-save-group"),
  detailModalElement: document.getElementById("leaderboard-detail-modal"),
  detailTitle: document.getElementById("leaderboard-detail-title"),
  detailSubtitle: document.getElementById("leaderboard-detail-subtitle"),
  detailLoading: document.getElementById("leaderboard-detail-loading"),
  detailError: document.getElementById("leaderboard-detail-error"),
  detailList: document.getElementById("leaderboard-detail-list")
};

const state = {
  initialized: false,
  loaded: false,
  groups: [],
  mainUsername: null,
  limits: { maxGroups: 50, maxMembers: 20, maxRangeDays: 366 },
  activeGroupId: Number(localStorage.getItem("activeLeaderboardGroup")) || null,
  type: LEADERBOARD_TYPES.has(localStorage.getItem("leaderboardType"))
    ? localStorage.getItem("leaderboardType")
    : "artists",
  editingGroupId: null,
  memberDraft: [],
  currentResult: null,
  resultController: null,
  detailController: null,
  groupModal: null,
  detailModal: null,
  resultLoadId: 0
};


function setSaveButtonLabel(label) {
  UI.saveGroup.innerHTML = `<span class="leaderboard-save-label">${escapeHTML(label)}</span>`;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDatePreset(days, { load = false } = {}) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - Math.max(1, Number(days) || 30) + 1);
  UI.from.value = formatDateInput(from);
  UI.to.value = formatDateInput(to);

  UI.presets.forEach(button => {
    button.classList.toggle("active", Number(button.dataset.days) === Number(days));
  });

  if (load && getActiveGroup()) loadLeaderboardResult();
}

function markCustomDateRange() {
  UI.presets.forEach(button => button.classList.remove("active"));
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function getActiveGroup() {
  return state.groups.find(group => Number(group.id) === Number(state.activeGroupId)) || null;
}

function showError(message) {
  UI.error.textContent = message;
  UI.error.classList.remove("d-none");
}

function clearError() {
  UI.error.textContent = "";
  UI.error.classList.add("d-none");
}

function setLoading(loading) {
  UI.loading.classList.toggle("d-none", !loading);
  UI.apply.disabled = loading;
  UI.refresh.disabled = loading;
}

function renderGroupList() {
  UI.groupCount.textContent = String(state.groups.length);

  if (!state.groups.length) {
    UI.groupsList.innerHTML = '<div class="leaderboard-groups-empty">No groups yet.</div>';
    UI.empty.classList.remove("d-none");
    UI.content.classList.add("d-none");
    return;
  }

  UI.groupsList.innerHTML = state.groups.map(group => {
    const avatars = group.members.slice(0, 3).map(member => `
      <img
        src="${escapeAttribute(safeImageUrl(member.avatar, AVATAR_PLACEHOLDER))}"
        data-fallback="${AVATAR_PLACEHOLDER}"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
      >
    `).join("");
    const extra = Math.max(0, group.members.length - 3);

    return `
      <button
        class="leaderboard-group-card ${Number(group.id) === Number(state.activeGroupId) ? "active" : ""}"
        data-group-id="${Number(group.id)}"
        type="button"
      >
        <div class="leaderboard-group-card-copy">
          <strong>${escapeHTML(group.name)}</strong>
          <span>${group.members.length} member${group.members.length === 1 ? "" : "s"}</span>
        </div>
        <div class="leaderboard-avatar-stack">
          ${avatars}
          ${extra ? `<span>+${extra}</span>` : ""}
        </div>
      </button>
    `;
  }).join("");

  installImageFallbacks(UI.groupsList);
  UI.groupsList.querySelectorAll(".leaderboard-group-card").forEach(button => {
    button.addEventListener("click", () => selectGroup(Number(button.dataset.groupId)));
  });
}

function renderActiveGroup() {
  const group = getActiveGroup();
  if (!group) {
    UI.empty.classList.remove("d-none");
    UI.content.classList.add("d-none");
    return;
  }

  UI.empty.classList.add("d-none");
  UI.content.classList.remove("d-none");
  UI.groupName.textContent = group.name;
  UI.groupMembersLabel.textContent = group.members.map(member => member.username).join(" · ");
  renderGroupList();
}

function selectGroup(groupId, { load = true } = {}) {
  const group = state.groups.find(item => Number(item.id) === Number(groupId));
  if (!group) return;

  state.activeGroupId = Number(group.id);
  state.currentResult = null;
  localStorage.setItem("activeLeaderboardGroup", String(group.id));
  renderActiveGroup();
  if (load) loadLeaderboardResult();
}

function renderMemberRanking(members) {
  const maxScrobbles = Math.max(1, ...members.map(member => Number(member.scrobbles) || 0));

  UI.memberRanking.innerHTML = members.map((member, index) => {
    const width = member.error ? 0 : Math.max(3, (Number(member.scrobbles) / maxScrobbles) * 100);
    const profileUrl = safeExternalUrl(member.url);
    const name = profileUrl
      ? `<a href="${escapeAttribute(profileUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(member.username)}</a>`
      : escapeHTML(member.username);

    return `
      <div class="leaderboard-member-row ${member.error ? "has-error" : ""}">
        <span class="leaderboard-rank-number">${index + 1}</span>
        <img
          src="${escapeAttribute(safeImageUrl(member.avatar, AVATAR_PLACEHOLDER))}"
          data-fallback="${AVATAR_PLACEHOLDER}"
          alt="${escapeAttribute(member.username)}"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
        >
        <div class="leaderboard-member-copy">
          <div class="leaderboard-member-name">${name}</div>
          ${member.realname ? `<small>${escapeHTML(member.realname)}</small>` : ""}
          <div class="leaderboard-progress"><span style="width: ${width}%"></span></div>
          ${member.error ? `<small class="text-danger">${escapeHTML(member.error)}</small>` : ""}
        </div>
        <strong>${member.error ? "—" : numberFormat.format(member.scrobbles)}</strong>
      </div>
    `;
  }).join("");

  installImageFallbacks(UI.memberRanking);
}

function getTypeLabel(type) {
  if (type === "albums") return "albums";
  if (type === "tracks") return "tracks";
  return "artists";
}

function renderItemLink(item, content) {
  const url = safeExternalUrl(item.url);
  if (!url) return content;
  return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
}

function renderItems(result) {
  UI.itemsTitle.textContent = `Top ${getTypeLabel(result.type)}`;

  if (!result.items.length) {
    UI.items.innerHTML = `
      <div class="leaderboard-no-data">
        No ${getTypeLabel(result.type)} were returned for this range.
      </div>
    `;
    return;
  }

  UI.items.innerHTML = result.items.map((item, index) => {
    const detailAvailable = result.type === "artists" || result.type === "albums";
    const topContribution = item.contributions[0];
    const title = renderItemLink(item, escapeHTML(item.name));

    return `
      <article class="leaderboard-item-row ${detailAvailable ? "is-clickable" : ""}" data-item-index="${index}">
        <span class="leaderboard-item-rank">${index + 1}</span>
        <img
          src="${escapeAttribute(safeImageUrl(item.image, COVER_PLACEHOLDER))}"
          data-fallback="${COVER_PLACEHOLDER}"
          alt="${escapeAttribute(item.name)}"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
        >
        <div class="leaderboard-item-copy">
          <strong>${title}</strong>
          ${item.artist ? `<span>${escapeHTML(item.artist)}</span>` : ""}
          <small>
            ${item.listeners} listener${item.listeners === 1 ? "" : "s"}
            ${topContribution ? ` · ${escapeHTML(topContribution.username)} leads with ${numberFormat.format(topContribution.plays)}` : ""}
          </small>
        </div>
        <div class="leaderboard-item-score">
          <strong>${numberFormat.format(item.plays)}</strong>
          <span>scrobbles</span>
        </div>
        ${detailAvailable ? '<i class="mdi mdi-chevron-right leaderboard-item-chevron"></i>' : ""}
      </article>
    `;
  }).join("");

  installImageFallbacks(UI.items);
  UI.items.querySelectorAll(".leaderboard-item-row.is-clickable").forEach(row => {
    row.addEventListener("click", event => {
      if (event.target.closest("a")) return;
      const item = result.items[Number(row.dataset.itemIndex)];
      if (item) openItemDetails(result.type === "artists" ? "artist" : "album", item);
    });
  });
}

function renderLeaderboardResult(result) {
  state.currentResult = result;
  const availableMembers = result.members.filter(member => !member.error);
  const leader = availableMembers[0];

  UI.totalScrobbles.textContent = numberFormat.format(result.totalScrobbles || 0);
  UI.activeMembers.textContent = `${availableMembers.length}/${result.members.length}`;
  UI.currentLeader.textContent = leader?.username || "—";
  const statusFlags = [
    result.partial ? "partial result" : null,
    result.stale || result.cache?.stale ? "using stale cache after a Last.fm error" : null
  ].filter(Boolean);
  UI.status.textContent = `${result.range.from} to ${result.range.to} · ${result.range.days} day${result.range.days === 1 ? "" : "s"}${statusFlags.length ? ` · ${statusFlags.join(" · ")}` : ""}`;
  UI.cacheState.textContent = result.cache?.hit
    ? `${result.cache.stale ? "Stale cache" : "Cached"} ${new Date(result.cache.cachedAt).toLocaleTimeString()}`
    : `Updated ${new Date(result.generatedAt).toLocaleTimeString()}`;

  renderMemberRanking(result.members);
  renderItems(result);
  UI.results.classList.remove("d-none");
}

async function loadLeaderboardResult({ refresh = false } = {}) {
  const group = getActiveGroup();
  if (!group) return;

  const loadId = ++state.resultLoadId;
  const hadResult = Boolean(state.currentResult);
  state.resultController?.abort();
  state.resultController = new AbortController();
  clearError();
  setLoading(true);
  if (!hadResult) UI.results.classList.add("d-none");
  UI.status.textContent = hadResult ? UI.status.textContent : "";

  try {
    const params = new URLSearchParams({
      from: UI.from.value,
      to: UI.to.value,
      type: state.type
    });
    if (refresh) params.set("refresh", "true");

    const result = await fetchJSON(
      `/api/leaderboards/groups/${group.id}/results?${params}`,
      { cache: "no-store", signal: state.resultController.signal }
    );
    if (loadId !== state.resultLoadId) return;
    renderLeaderboardResult(result);
  } catch (error) {
    if (error.name === "AbortError" || loadId !== state.resultLoadId) return;
    showError(error.message || "Could not load this leaderboard");
    if (hadResult) UI.results.classList.remove("d-none");
  } finally {
    if (loadId === state.resultLoadId) setLoading(false);
  }
}

function renderMemberDraft() {
  UI.memberChips.innerHTML = state.memberDraft.map((username, index) => `
    <span class="leaderboard-member-chip">
      ${escapeHTML(username)}
      <button type="button" data-member-index="${index}" aria-label="Remove ${escapeAttribute(username)}">×</button>
    </span>
  `).join("");

  UI.memberLimit.textContent = `${state.memberDraft.length}/${state.limits.maxMembers} members · at least 2 required.`;
  UI.addMe.disabled = !state.mainUsername || state.memberDraft.some(
    member => member.toLocaleLowerCase() === state.mainUsername.toLocaleLowerCase()
  );
}

function addMemberToDraft(value) {
  const username = String(value || "").trim();
  if (!username) return;

  if (/\s/.test(username)) {
    showFormError("Last.fm usernames cannot contain spaces");
    return;
  }
  if (state.memberDraft.length >= state.limits.maxMembers) {
    showFormError(`A group can have at most ${state.limits.maxMembers} members`);
    return;
  }
  if (state.memberDraft.some(member => member.toLocaleLowerCase() === username.toLocaleLowerCase())) {
    UI.memberInput.value = "";
    return;
  }

  state.memberDraft.push(username);
  UI.memberInput.value = "";
  clearFormError();
  renderMemberDraft();
}

function showFormError(message) {
  UI.formError.textContent = message;
  UI.formError.classList.remove("d-none");
}

function clearFormError() {
  UI.formError.textContent = "";
  UI.formError.classList.add("d-none");
}

function openGroupModal(group = null) {
  state.editingGroupId = group ? Number(group.id) : null;
  state.memberDraft = group
    ? group.members.map(member => member.username)
    : state.mainUsername
      ? [state.mainUsername]
      : [];

  UI.groupModalTitle.textContent = group ? "Edit leaderboard group" : "Create leaderboard group";
  UI.groupNameInput.value = group?.name || "";
  UI.memberInput.value = "";
  setSaveButtonLabel(group ? "Save changes" : "Create group");
  clearFormError();
  renderMemberDraft();
  state.groupModal.show();
  setTimeout(() => UI.groupNameInput.focus(), 200);
}

async function saveGroup() {
  if (UI.memberInput.value.trim()) addMemberToDraft(UI.memberInput.value);

  const name = UI.groupNameInput.value.trim();
  if (!name) return showFormError("Group name is required");
  if (state.memberDraft.length < 2) return showFormError("Add at least two Last.fm users");

  UI.saveGroup.disabled = true;
  UI.saveGroup.innerHTML = '<i class="mdi mdi-loading mdi-spin me-1"></i> Checking users';
  clearFormError();

  try {
    const editing = Boolean(state.editingGroupId);
    const url = editing
      ? `/api/leaderboards/groups/${state.editingGroupId}`
      : "/api/leaderboards/groups";
    const group = await fetchJSON(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, members: state.memberDraft })
    });

    state.groupModal.hide();
    await loadGroups({ preferredGroupId: group.id });
  } catch (error) {
    showFormError(error.message || "Could not save the group");
  } finally {
    UI.saveGroup.disabled = false;
    setSaveButtonLabel(state.editingGroupId ? "Save changes" : "Create group");
  }
}

async function deleteActiveGroup() {
  const group = getActiveGroup();
  if (!group) return;
  if (!window.confirm(`Delete the leaderboard group "${group.name}"?`)) return;

  UI.deleteGroup.disabled = true;
  clearError();

  try {
    await fetchJSON(`/api/leaderboards/groups/${group.id}`, { method: "DELETE" });
    localStorage.removeItem("activeLeaderboardGroup");
    state.activeGroupId = null;
    state.currentResult = null;
    await loadGroups();
  } catch (error) {
    showError(error.message || "Could not delete the group");
  } finally {
    UI.deleteGroup.disabled = false;
  }
}

function renderDetailList(data) {
  UI.detailTitle.textContent = data.kind === "album"
    ? `${data.title} — top tracks`
    : `${data.title} — top tracks`;
  UI.detailSubtitle.textContent = `${data.group.name} · ${data.range.from} to ${data.range.to} · ${numberFormat.format(data.totalScrobbles)} scrobbles`;

  if (!data.items.length) {
    UI.detailList.innerHTML = '<div class="leaderboard-no-data">No matching tracks were found in this range.</div>';
  } else {
    UI.detailList.innerHTML = data.items.map((item, index) => {
      const url = safeExternalUrl(item.url);
      const title = url
        ? `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.name)}</a>`
        : escapeHTML(item.name);

      return `
        <div class="leaderboard-detail-row">
          <span>${index + 1}</span>
          <img
            src="${escapeAttribute(safeImageUrl(item.image, COVER_PLACEHOLDER))}"
            data-fallback="${COVER_PLACEHOLDER}"
            alt="${escapeAttribute(item.name)}"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
          >
          <div>
            <strong>${title}</strong>
            <small>${escapeHTML(item.artist || data.artist || "")}</small>
          </div>
          <strong>${numberFormat.format(item.plays)}</strong>
        </div>
      `;
    }).join("");
  }

  installImageFallbacks(UI.detailList);
  UI.detailLoading.classList.add("d-none");
  UI.detailList.classList.remove("d-none");
}

async function openItemDetails(kind, item) {
  const group = getActiveGroup();
  if (!group) return;

  state.detailController?.abort();
  state.detailController = new AbortController();
  UI.detailTitle.textContent = `Loading ${item.name}...`;
  UI.detailSubtitle.textContent = "";
  UI.detailError.classList.add("d-none");
  UI.detailList.classList.add("d-none");
  UI.detailLoading.classList.remove("d-none");
  state.detailModal.show();

  try {
    const params = new URLSearchParams({
      kind,
      name: item.name,
      from: UI.from.value,
      to: UI.to.value
    });
    if (item.artist) params.set("artist", item.artist);

    const data = await fetchJSON(
      `/api/leaderboards/groups/${group.id}/details?${params}`,
      { cache: "no-store", signal: state.detailController.signal }
    );
    renderDetailList(data);
  } catch (error) {
    if (error.name === "AbortError") return;
    UI.detailLoading.classList.add("d-none");
    UI.detailError.textContent = error.message || "Could not load top tracks";
    UI.detailError.classList.remove("d-none");
  }
}

async function loadGroups({ preferredGroupId = null } = {}) {
  clearError();

  try {
    const data = await fetchJSON("/api/leaderboards/groups", { cache: "no-store" });
    state.groups = data.groups || [];
    state.loaded = true;
    state.mainUsername = data.mainUsername || null;
    state.limits = { ...state.limits, ...(data.limits || {}) };
    UI.addMe.classList.toggle("d-none", !state.mainUsername);
    UI.presets.forEach(button => {
      button.disabled = Number(button.dataset.days) > state.limits.maxRangeDays;
    });

    const selectedId = preferredGroupId
      || state.activeGroupId
      || state.groups[0]?.id
      || null;
    const selectedExists = state.groups.some(group => Number(group.id) === Number(selectedId));
    state.activeGroupId = selectedExists ? Number(selectedId) : Number(state.groups[0]?.id) || null;

    renderGroupList();
    renderActiveGroup();

    if (state.activeGroupId) {
      localStorage.setItem("activeLeaderboardGroup", String(state.activeGroupId));
      await loadLeaderboardResult();
    }
  } catch (error) {
    showError(error.message || "Could not load leaderboard groups");
  }
}

function initEvents() {
  state.groupModal = bootstrap.Modal.getOrCreateInstance(UI.groupModalElement);
  state.detailModal = bootstrap.Modal.getOrCreateInstance(UI.detailModalElement);

  UI.newGroup.addEventListener("click", () => openGroupModal());
  UI.emptyCreate.addEventListener("click", () => openGroupModal());
  UI.editGroup.addEventListener("click", () => openGroupModal(getActiveGroup()));
  UI.deleteGroup.addEventListener("click", deleteActiveGroup);
  UI.saveGroup.addEventListener("click", saveGroup);
  UI.groupForm.addEventListener("submit", event => {
    event.preventDefault();
    saveGroup();
  });
  UI.addMember.addEventListener("click", () => addMemberToDraft(UI.memberInput.value));
  UI.addMe.addEventListener("click", () => addMemberToDraft(state.mainUsername));
  UI.memberInput.addEventListener("keydown", event => {
    if (["Enter", ","].includes(event.key)) {
      event.preventDefault();
      addMemberToDraft(UI.memberInput.value.replace(/,$/, ""));
    }
  });
  UI.memberChips.addEventListener("click", event => {
    const button = event.target.closest("button[data-member-index]");
    if (!button) return;
    state.memberDraft.splice(Number(button.dataset.memberIndex), 1);
    renderMemberDraft();
  });

  UI.presets.forEach(button => {
    button.addEventListener("click", () => setDatePreset(Number(button.dataset.days), { load: true }));
  });
  UI.from.addEventListener("change", markCustomDateRange);
  UI.to.addEventListener("change", markCustomDateRange);
  UI.types.forEach(button => {
    button.classList.toggle("active", button.dataset.type === state.type);
    button.addEventListener("click", () => {
      state.type = button.dataset.type;
      localStorage.setItem("leaderboardType", state.type);
      UI.types.forEach(item => item.classList.toggle("active", item === button));
      if (getActiveGroup()) loadLeaderboardResult();
    });
  });
  UI.apply.addEventListener("click", () => loadLeaderboardResult());
  UI.refresh.addEventListener("click", () => loadLeaderboardResult({ refresh: true }));

  UI.groupModalElement.addEventListener("hidden.bs.modal", () => {
    clearFormError();
    UI.saveGroup.disabled = false;
  });
  UI.detailModalElement.addEventListener("hidden.bs.modal", () => {
    state.detailController?.abort();
  });
}

export async function loadLeaderboards() {
  if (!state.initialized) {
    state.initialized = true;
    initEvents();
    const today = formatDateInput(new Date());
    UI.from.max = today;
    UI.to.max = today;
    setDatePreset(30);
  }

  if (!state.loaded) await loadGroups();
}
