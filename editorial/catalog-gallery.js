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

function videoCard(video, number) {
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
    const { videos } = await response.json();
    const start = (Number(page) - 1) * 20;
    grid.replaceChildren(...videos.slice(0, 20).flatMap((video, index) =>
      httpsUrl(video.watchUrl) ? [videoCard(video, start + index + 1)] : []
    ));
    status.textContent = grid.children.length ? "" : "No previews are available for this page.";
    if (grid.children.length) button.hidden = true;
  } catch {
    status.textContent = "Previews are temporarily unavailable. Try again.";
  } finally {
    button.disabled = false;
  }
});
