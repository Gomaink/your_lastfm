let initialized = false;
let currentImageUrl = null;
let activeController = null;

function setLoading(elements, loading) {
  elements.shareLoading.classList.toggle("d-none", !loading);
  elements.btnGenerate.disabled = loading;
}

async function getErrorMessage(response) {
  try {
    const data = await response.json();
    return data.error || "Generation failed";
  } catch {
    return `Generation failed (${response.status})`;
  }
}

export function initSharePage() {
  if (initialized) return;

  const elements = {
    btnGenerate: document.getElementById("btn-generate"),
    shareResult: document.getElementById("share-result"),
    shareLoading: document.getElementById("share-loading"),
    sharePlaceholder: document.getElementById("share-placeholder"),
    btnDownload: document.getElementById("btn-download"),
    shareError: document.getElementById("share-error")
  };

  if (!elements.btnGenerate) return;
  initialized = true;

  elements.btnGenerate.addEventListener("click", async () => {
    const period = document.getElementById("share-period").value;
    const formatElement = document.querySelector('input[name="format-option"]:checked');
    const format = formatElement?.value || "standard";
    const types = [];

    if (document.getElementById("check-albums").checked) types.push("albums");
    if (document.getElementById("check-artists").checked) types.push("artists");
    if (document.getElementById("check-tracks").checked) types.push("tracks");

    if (!types.length) {
      elements.shareError.textContent = "Please select at least one item to display.";
      elements.shareError.classList.remove("d-none");
      return;
    }

    activeController?.abort();
    activeController = new AbortController();
    const timeout = setTimeout(() => activeController.abort(), 120000);

    elements.sharePlaceholder.classList.add("d-none");
    elements.shareResult.classList.add("d-none");
    elements.btnDownload.classList.add("d-none");
    elements.shareError.classList.add("d-none");
    elements.shareError.textContent = "";
    setLoading(elements, true);

    try {
      const queryParams = new URLSearchParams({
        period,
        types: types.join(","),
        format
      });

      const response = await fetch(`/api/generate-share?${queryParams}`, {
        signal: activeController.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("The server returned an invalid image");
      }

      if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
      currentImageUrl = URL.createObjectURL(blob);

      elements.shareResult.src = currentImageUrl;
      elements.shareResult.classList.remove("d-none");
      elements.btnDownload.href = currentImageUrl;
      elements.btnDownload.download = `my-music-${period}-${format}.png`;
      elements.btnDownload.classList.remove("d-none");
    } catch (error) {
      console.error("Share generation error:", error);
      const message = error.name === "AbortError"
        ? "The image took too long to generate. Please try again."
        : error.message;

      elements.shareError.textContent = message;
      elements.shareError.classList.remove("d-none");
      elements.sharePlaceholder.classList.remove("d-none");
    } finally {
      clearTimeout(timeout);
      activeController = null;
      setLoading(elements, false);
    }
  });

  window.addEventListener("beforeunload", () => {
    activeController?.abort();
    if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
  });
}
