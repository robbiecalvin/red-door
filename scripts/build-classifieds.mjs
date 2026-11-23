import fs from "node:fs";

const categories = Object.entries(JSON.parse(fs.readFileSync("shared/classifiedCategories.json", "utf8")));

const examples = JSON.parse(fs.readFileSync("shared/classifiedExamples.json", "utf8"));
const vancouverCategoryGuidance = {
  housing: '<p>Use the nearest <a href="https://www.translink.ca/schedules-and-maps/skytrain">SkyTrain station</a> or a cross street to describe access. If you share a kitchen or bathroom with the owner, check what rules apply before assuming the same protections as a standard tenancy. Read the <a href="https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies">B.C. residential tenancy resources</a> before paying a deposit.</p>',
  events: '<p>For an event in Davie Village or another Vancouver neighbourhood, include the venue name, cover charge, venue age rules, and any step-free access information. See the <a href="../../../vancouver/">Vancouver guide</a> for local organizers and venue links.</p>',
};

export function writeClassifiedPages(cities, baseUrl, escapeHtml) {
  const indexablePaths = [];
  for (const city of cities) {
    const exampleLocation = cities.some(entry => entry.id !== city.id && entry.name === city.name)
      ? `${city.name}, ${city.region}` : city.name;
    const cityPath = `classifieds/${city.id}/`;
    for (const [categoryId, category] of [[null, null], ...categories]) {
      const path = categoryId ? `${cityPath}${categoryId}/` : cityPath;
      const root = categoryId ? "../../../" : "../../";
      const title = category ? `${city.name} ${category.toLowerCase()} classifieds` : `${city.name} classifieds`;
      const description = category
        ? `Browse and post ${category.toLowerCase()} classifieds in ${city.name}, ${city.region}, with your Badehaus X account.`
        : `Find housing, jobs, services, events, and other local classifieds in ${city.name}, ${city.region}, with Badehaus X.`;
      const localGuidance = city.id === "vancouver" ? vancouverCategoryGuidance[categoryId] : undefined;
      const indexable = city.id === "vancouver" && (!categoryId || Boolean(localGuidance));
      const appLink = `${root}?city=${city.id}${categoryId ? `&amp;category=${categoryId}` : ""}#/ads`;
      const categoriesList = categories.map(([id, label]) => id === categoryId
        ? `<li aria-current="page">${escapeHtml(label)}</li>`
        : `<li><a href="${categoryId ? "../" : "./"}${id}/">${escapeHtml(label)}</a></li>`).join("");
      const [guidance, sampleTitle, sampleBody] = examples[categoryId ?? "overview"];
      const exampleLink = `${root}?city=${city.id}&amp;category=${categoryId ?? "community"}&amp;example=${categoryId ? "category" : "overview"}#/ads`;
      const videosLink = appLink.replace("#/ads", "&amp;videos=1#/ads");
      const vancouverResources = indexable && !categoryId ? `
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
<p>${escapeHtml(guidance)}</p>
${localGuidance ?? ""}
<p><a class="site-action" href="${appLink}">${category ? `Open ${escapeHtml(category.toLowerCase())} listings` : "Open the classifieds board"}</a></p>
<p>Confirm you’re 18 or older to browse. Sign in with your Badehaus X account to post for free.</p>
${vancouverResources}
<section aria-labelledby="classified-example">
<h2 id="classified-example">Example post · fictional</h2>
<blockquote><strong>${escapeHtml(sampleTitle.replace("{city}", exampleLocation))}</strong><p>${escapeHtml(sampleBody)}</p></blockquote>
<p><a class="site-action" href="${exampleLink}">Use this template</a></p>
</section>
<h2>Classifieds categories</h2><ul>${categoriesList}</ul>
${categoryId ? `<p><a href="../">All ${escapeHtml(city.name)} classifieds</a></p>` : ""}
<h2>From the 18+ directory</h2>
<p><a href="${videosLink}">Show video previews after sign-in</a></p>
<p><a href="${root}legal/">Policies and community guidelines</a></p>
</article></main></body></html>
`);
      if (indexable) indexablePaths.push(path);
    }
  }
  return indexablePaths;
}
