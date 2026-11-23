import fs from "node:fs";

const categories = Object.entries(JSON.parse(fs.readFileSync("shared/classifiedCategories.json", "utf8")));

export function writeClassifiedPages(cities, baseUrl, escapeHtml) {
  const indexablePaths = [];
  for (const city of cities) {
    const cityPath = `classifieds/${city.id}/`;
    for (const [categoryId, category] of [[null, null], ...categories]) {
      const path = categoryId ? `${cityPath}${categoryId}/` : cityPath;
      const root = categoryId ? "../../../" : "../../";
      const title = category ? `${city.name} ${category.toLowerCase()} classifieds` : `${city.name} classifieds`;
      const description = category
        ? `Browse and post ${category.toLowerCase()} classifieds in ${city.name}, ${city.region}, with your Badehaus X account.`
        : `Find housing, jobs, services, events, and other local classifieds in ${city.name}, ${city.region}, with Badehaus X.`;
      const indexable = city.id === "vancouver" && !categoryId;
      const appLink = `${root}?city=${city.id}${categoryId ? `&amp;category=${categoryId}` : ""}#/ads`;
      const categoriesList = categories.map(([id, label]) => id === categoryId
        ? `<li aria-current="page">${escapeHtml(label)}</li>`
        : `<li><a href="${categoryId ? "../" : "./"}${id}/">${escapeHtml(label)}</a></li>`).join("");
      const vancouverResources = indexable ? `
        <h2>Find the right place to post</h2>
        <p>For a room or sublet, name the neighbourhood or nearest transit stop and give the move-in date and total monthly cost. For an event in Davie Village or elsewhere in Vancouver, list the venue, date, admission cost, and accessibility details if you know them. Keep private addresses and contact details out of your post.</p>
        <p>See the <a href="../../vancouver/">gay Vancouver guide</a> for local venues and groups, or read <a href="../../thebackroom/meet-gay-men-vancouver/">where to meet gay men in Vancouver beyond the bars</a>.</p>` : "";
      fs.mkdirSync(`dist/${path}`, { recursive: true });
      fs.writeFileSync(`dist/${path}index.html`, `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | Badehaus X</title>
<meta name="description" content="${escapeHtml(description)}">
${indexable ? "" : '<meta name="robots" content="noindex, follow">'}
<link rel="canonical" href="${escapeHtml(baseUrl + path)}">
<link rel="stylesheet" href="${root}site-theme.css">
</head>
<body class="site-page site-article">
<header class="site-header"><div class="site-header-inner">
<a class="site-brand" href="${root}"><img src="${root}icons/icon-192.png" width="36" height="36" alt="">Badehaus X</a>
<nav aria-label="Site navigation"><a href="${root}#classifieds">Choose a city</a><a href="${root}gay-cruising/">Cruising guide</a></nav>
</div></header>
<main><article>
<header><p>${escapeHtml(city.region)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></header>
<p><a class="site-action" href="${appLink}">${category ? `Open ${escapeHtml(category.toLowerCase())} listings` : "Open the classifieds board"}</a></p>
<p>Confirm you’re 18 or older to browse. Sign in with your Badehaus X account to post for free.</p>
${vancouverResources}
<h2>Classifieds categories</h2><ul>${categoriesList}</ul>
${categoryId ? `<p><a href="../">All ${escapeHtml(city.name)} classifieds</a></p>` : ""}
<p><a href="${root}legal/">Policies and community guidelines</a></p>
</article></main></body></html>
`);
      if (indexable) indexablePaths.push(path);
    }
  }
  return indexablePaths;
}
