const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
};

const HTTPS_IMAGE_HOSTS = [
  /(^|\.)last\.fm$/i,
  /(^|\.)lastfm\.freetls\.fastly\.net$/i,
  /(^|\.)lastfm-img2\.akamaized\.net$/i,
  /(^|\.)img2-ak\.lst\.fm$/i,
  /(^|\.)dzcdn\.net$/i,
  /(^|\.)deezer\.com$/i
];

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => HTML_ENTITIES[character]);
}

export function escapeAttribute(value) {
  return escapeHTML(value);
}

export function safeImageUrl(value, fallback = "/images/artist-placeholder.png") {
  const url = String(value || "").trim();
  if (!url) return fallback;

  if (url.startsWith("/") || url.startsWith("blob:")) return url;

  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;

    if (
      window.location.protocol === "https:"
      && parsed.protocol === "http:"
      && HTTPS_IMAGE_HOSTS.some(pattern => pattern.test(parsed.hostname))
    ) {
      parsed.protocol = "https:";
    }

    return parsed.href;
  } catch {
    return fallback;
  }
}

export function installImageFallback(image, fallback = "/images/artist-placeholder.png") {
  if (!image || image.dataset.fallbackReady === "true") return;

  const safeFallback = safeImageUrl(fallback, "/images/artist-placeholder.png");
  image.dataset.fallbackReady = "true";

  image.addEventListener("error", () => {
    if (image.src === new URL(safeFallback, window.location.origin).href) return;
    image.src = safeFallback;
  });

  if (image.complete && image.naturalWidth === 0) image.src = safeFallback;
}

export function installImageFallbacks(root = document) {
  root.querySelectorAll("img[data-fallback]").forEach(image => {
    installImageFallback(image, image.dataset.fallback);
  });
}
