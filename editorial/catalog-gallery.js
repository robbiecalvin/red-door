const gallery = document.querySelector("[data-catalog-gallery]");
const button = gallery.querySelector("button");
const status = gallery.querySelector("[role=status]");
const grid = gallery.querySelector("ul");

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

const saveButtons = new Map();
let favorites = [];
let saving = false;

function updateSaveButtons() {
  for (const [id, control] of saveButtons) {
    const saved = favorites.includes(id);
    control.textContent = saved ? "Remove saved video" : "Save video";
    control.setAttribute("aria-pressed", String(saved));
    control.disabled = saving || (!saved && favorites.length >= 3);
  }
}

async function saveVideo(id, token) {
  if (saving) return;
  saving = true;
  updateSaveButtons();
  const saved = !favorites.includes(id);
  try {
    const url = new URL(`${gallery.dataset.api.replace(/\/$/, "")}/adult-library/favorite`, document.baseURI);
    const response = await fetch(url, {
      method: "PUT", headers: { "content-type": "application/json", "x-session-token": token },
      credentials: "omit", cache: "no-store", redirect: "error", body: JSON.stringify({ id, saved })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Could not update saved videos.");
    favorites = data.favorites ?? [];
    status.textContent = `Video ${saved ? "saved to" : "removed from"} your profile. ${favorites.length} of 3 saved.`;
  } catch (error) {
    status.textContent = error.message || "Could not update saved videos.";
  } finally {
    saving = false;
    updateSaveButtons();
  }
}

function videoCard(video, number, token) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.href = httpsUrl(video.watchUrl);
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const fallback = document.createElement("span");
  fallback.textContent = "Thumbnail unavailable";
  const source = httpsUrl(video.thumbnailUrl);
  if (source) {
    const thumbnail = document.createElement("img");
    thumbnail.alt = "";
    thumbnail.loading = "lazy";
    thumbnail.referrerPolicy = "no-referrer";
    thumbnail.addEventListener("error", () => thumbnail.replaceWith(fallback), { once: true });
    thumbnail.src = source;
    link.append(thumbnail);
  } else {
    link.append(fallback);
  }
  const title = document.createElement("span");
  title.textContent = `Open video ${number}`;
  link.append(title);
  item.append(link);
  if (typeof video.id !== "string") return item;
  const save = document.createElement("button");
  save.type = "button";
  save.className = "site-action";
  save.addEventListener("click", () => void saveVideo(video.id, token));
  saveButtons.set(video.id, save);
  item.append(save);
  return item;
}

button.hidden = false;
button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Loading previews…";
  try {
    let token;
    try { token = localStorage.getItem("reddoor_session_token"); } catch {}
    if (!token) {
      try { token = sessionStorage.getItem("reddoor_session_token"); } catch {}
    }
    if (!token) {
      status.textContent = "Sign in with an age-verified Badehaus X account to view thumbnails.";
      return;
    }
    const { api, category, page } = gallery.dataset;
    const url = new URL(`${api.replace(/\/$/, "")}/adult-library/catalog`, document.baseURI);
    url.search = new URLSearchParams({ category, page });
    const response = await fetch(url, {
      headers: { "x-session-token": token },
      credentials: "omit",
      cache: "no-store",
      redirect: "error"
    });
    if (response.status === 401 || response.status === 403) {
      status.textContent = "Sign in with an age-verified Badehaus X account to view thumbnails.";
      return;
    }
    if (!response.ok) throw new Error("Catalog request failed");
    const data = await response.json();
    const { videos } = data;
    favorites = data.favorites ?? [];
    saveButtons.clear();
    const start = (Number(page) - 1) * 20;
    grid.replaceChildren(...videos.slice(0, 20).flatMap((video, index) =>
      httpsUrl(video.watchUrl) ? [videoCard(video, start + index + 1, token)] : []
    ));
    updateSaveButtons();
    status.textContent = grid.children.length ? `Save up to three videos to show to age-verified members on your profile. ${favorites.length} of 3 saved.` : "No previews are available for this page.";
    if (grid.children.length) button.hidden = true;
  } catch {
    status.textContent = "Previews are temporarily unavailable. Try again.";
  } finally {
    button.disabled = false;
  }
});
