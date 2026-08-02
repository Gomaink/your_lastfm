import { fetchJSON } from "./api.js";
import { installImageFallback, safeImageUrl } from "./dom.js";

let listenersAttached = false;

export async function loadAccount() {
  await fetchAndRenderStats();

  if (!listenersAttached) {
    setupCsvButtons();
    listenersAttached = true;
  }
}

async function fetchAndRenderStats() {
  try {
    const data = await fetchJSON("/api/user-stats", { cache: "no-store" });
    updateText("profile-username", data.username || "User");

    const avatar = document.querySelector(".profile-avatar img");
    if (avatar) {
      avatar.src = safeImageUrl(data.avatar);
      installImageFallback(avatar);
    }

    const format = number => new Intl.NumberFormat("pt-BR").format(number || 0);
    updateText("profile-total-scrobbles", format(data.totalScrobbles));
    updateText("profile-artists", format(data.uniqueArtists));
    updateText("profile-albums", format(data.uniqueAlbums));
    updateText("profile-tracks", format(data.uniqueTracks));

    if (data.joinedDate) {
      const date = new Date(data.joinedDate * 1000);
      const dateText = new Intl.DateTimeFormat("pt-BR", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(date);
      updateText("profile-joined-date", dateText);
    }
  } catch (error) {
    console.error("Error loading account:", error);
  }
}

function updateText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function setupCsvButtons() {
  const exportButton = document.getElementById("btn-export-csv");
  exportButton?.addEventListener("click", () => {
    window.location.href = "/api/export/scrobbles";
  });

  const importButton = document.getElementById("btn-import-trigger");
  const fileInput = document.getElementById("csv-upload-input");
  if (!importButton || !fileInput) return;

  importButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const originalText = importButton.innerHTML;
    importButton.textContent = "Uploading...";
    importButton.disabled = true;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const result = await fetchJSON("/api/import/scrobbles", {
        method: "POST",
        body: formData
      });

      alert(
        `Success! ${result.imported} new scrobbles imported.`
        + (result.duplicates ? ` ${result.duplicates} duplicates ignored.` : "")
        + (result.skipped ? ` ${result.skipped} invalid rows skipped.` : "")
      );
      await fetchAndRenderStats();
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      importButton.innerHTML = originalText;
      importButton.disabled = false;
      fileInput.value = "";
    }
  });
}
