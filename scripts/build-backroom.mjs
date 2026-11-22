import fs from "node:fs";

const directory = new URL("../editorial/backroom/", import.meta.url);
const entries = JSON.parse(fs.readFileSync(new URL("articles.json", directory), "utf8"));
const esc = (value) => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const bodyText = (value) => esc(value).replace(/\[([^\]]+)\]\(((?:https:\/\/[a-z0-9.-]+)?\/[a-z0-9/._-]+)\)/g, '<a href="$2">$1</a>');

export function availableBackroomArticles(now = Date.now()) {
  return entries.filter(entry => Date.parse(`${entry.date}T10:00:00-08:00`) <= now);
}

export function writeBackroomArticles(articles, baseUrl) {
  const indexPath = "dist/thebackroom/index.html";
  const index = fs.readFileSync(indexPath, "utf8");
  const links = articles.map(entry => `<li><a href="./${entry.slug}/">${esc(entry.title)}</a></li>`).join("");
  if (links) fs.writeFileSync(indexPath, index.replace("</body>", `<noscript><h2>Recent Backroom articles</h2><ul>${links}</ul></noscript></body>`));

  for (const entry of articles) {
    const { slug, title, synopsis, alt, date, sections } = entry;
    const canonical = `${baseUrl}thebackroom/${slug}/`;
    const image = `${baseUrl}thebackroom/covers/${slug}.jpg`;
    const published = `${date}T10:00:00-08:00`;
    const schema = JSON.stringify({
      "@context": "https://schema.org", "@type": "Article", headline: title,
      description: synopsis, image, datePublished: published, mainEntityOfPage: canonical,
      author: { "@type": "Organization", name: "Badehaus X", url: baseUrl },
      publisher: { "@type": "Organization", name: "Badehaus X", url: baseUrl },
    }).replaceAll("<", "\\u003c");
    const content = sections.map(([heading, paragraph]) => `<section><h2>${esc(heading)}</h2><p>${bodyText(paragraph)}</p></section>`).join("\n");
    fs.mkdirSync(`dist/thebackroom/${slug}`, { recursive: true });
    fs.copyFileSync(new URL(`covers/${slug}.jpg`, directory), `dist/thebackroom/covers/${slug}.jpg`);
    fs.writeFileSync(`dist/thebackroom/${slug}/index.html`, `<!doctype html>
<html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · The Backroom</title><meta name="description" content="${esc(synopsis)}">
<link rel="canonical" href="${esc(canonical)}"><link rel="stylesheet" href="../../site-theme.css">
<meta property="og:type" content="article"><meta property="og:site_name" content="Badehaus X">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(synopsis)}">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:alt" content="${esc(alt)}">
<meta property="article:published_time" content="${published}"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${schema}</script></head>
<body class="site-page site-article"><header class="site-header"><div class="site-header-inner">
<a class="site-brand" href="../../"><img src="../../icons/icon-192.png" width="36" height="36" alt="">Badehaus X</a>
<nav aria-label="Site navigation"><a href="../">The Backroom</a><a href="../../store/">Shop</a></nav>
</div></header><main>
<article><header><h1>${esc(title)}</h1><p>${esc(synopsis)}</p><p>By Badehaus X · <time datetime="${date}">${date}</time></p></header>
<img width="382" height="510" style="width:min(100%,382px);height:auto" src="../covers/${slug}.jpg" alt="${esc(alt)}">
${content}
</article><p><a href="../">More from The Backroom</a></p></main></body></html>
`);
  }

  const paths = ["", "thebackroom/", ...fs.readdirSync("dist/thebackroom", { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(`dist/thebackroom/${entry.name}/index.html`))
    .map(entry => `thebackroom/${entry.name}/`)];
  fs.writeFileSync("dist/robots.txt", `User-agent: *\nSitemap: ${baseUrl}sitemap.xml\n`);
  fs.writeFileSync("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(path => `<url><loc>${esc(baseUrl + path)}</loc></url>`).join("\n")}
</urlset>\n`);
}
