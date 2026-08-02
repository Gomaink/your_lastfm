export async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  return res.json();
}
