import fs from "node:fs";
import path from "node:path";

export function writeAdultCatalogPages(directory, baseUrl, escapeHtml) {
  const manifestPath = directory ? path.join(directory, "manifest.json") : "shared/adult-catalog-manifest.json";
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const landingPath = "dist/gay-porn/index.html";
  const list = manifest.map(({ name, slug, count }) =>
    `<li><a href="./cat/${slug}/">${escapeHtml(name)}</a> (${count})</li>`).join("");
  const landing = fs.readFileSync(landingPath, "utf8");
  fs.writeFileSync(landingPath, landing.replace("</article>", () => `<h2>Video categories</h2><ul>${list}</ul></article>`));

  const catalogPaths = [];
  for (const { name, slug, count, pages } of manifest) {
    const base = `gay-porn/cat/${slug}/`;
    const pagePath = number => number === 1 ? base : `${base}page/${number}/`;
    for (let number = 1; number <= pages; number++) {
      const route = pagePath(number);
      catalogPaths.push(route);
      const root = "../".repeat(route.split("/").length - 1);
      const title = `${name} gay videos${number > 1 ? ` (page ${number})` : ""}`;
      const description = `Browse the ${name} category in the Badehaus X adult video directory. Page ${number} of ${pages}. Sign in to see previews.`;
      const previous = number > 1 ? `<a rel="prev" href="${root}${pagePath(number - 1)}">Previous page</a>` : "";
      const next = number < pages ? `<a rel="next" href="${root}${pagePath(number + 1)}">Next page</a>` : "";
      fs.mkdirSync(`dist/${route}`, { recursive: true });
      fs.writeFileSync(`dist/${route}index.html`, `<!doctype html>
<html lang="en-CA"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | Badehaus X</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl + route)}">
<link rel="stylesheet" href="${root}site-theme.css">
</head><body class="site-page site-article">
<main><article><p><a href="${root}gay-porn/">Adult video categories</a></p>
<h1>${escapeHtml(title)}</h1>
<p>Entries ${(number - 1) * 20 + 1}–${Math.min(number * 20, count)} of ${count}. For adults 18 and over.</p>
<p><a class="site-action" href="${root}?videoCategory=${slug}&amp;videoPage=${number}#/adult-library">Open this page in the directory</a></p>
<nav aria-label="Video results pages">${previous} <span>Page ${number} of ${pages}</span> ${next}</nav>
</article></main></body></html>`);
    }
  }
  return catalogPaths;
}
