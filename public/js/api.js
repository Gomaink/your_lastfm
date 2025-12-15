import { buildQuery } from "./filters.js";

export async function fetchJSON(url) {
  const res = await fetch(url + buildQuery());
  return res.json();
}
