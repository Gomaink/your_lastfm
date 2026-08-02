const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
};

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
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {}

  return fallback;
}
