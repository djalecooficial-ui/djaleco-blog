// Generates a static HTML blog from the WordPress REST API at blog.djaleco.com.br
// Run with: node scripts/build.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SITE = 'https://blog.djaleco.com.br';
const ROOT = path.resolve(import.meta.dirname, '..');
const IMG_DIR = path.join(ROOT, 'assets', 'images');

const BRAND_PINK = '#d98a97';
const BRAND_DARK = '#1a1a1a';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.json();
}

async function downloadImage(url) {
  const clean = url.split('?')[0];
  const filename = decodeURIComponent(clean.split('/').pop());
  const dest = path.join(IMG_DIR, filename);
  if (!existsSync(dest)) {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  ! could not download ${url} (${res.status})`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    console.log(`  downloaded ${filename}`);
  }
  return `/assets/images/${filename}`;
}

function extractImgUrls(html) {
  const urls = new Set();
  const re = /<img[^>]+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) urls.add(m[1]);
  // also catch srcset entries
  const re2 = /srcset="([^"]+)"/g;
  while ((m = re2.exec(html))) {
    for (const part of m[1].split(',')) {
      const u = part.trim().split(' ')[0];
      if (u) urls.add(u);
    }
  }
  return [...urls];
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layout({ title, description, canonical, ogImage, bodyHtml, isPost }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${isPost ? 'article' : 'website'}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<header class="site-header">
  <a href="/" class="brand">D.Jaleco <span>Blog</span></a>
</header>
<main>
${bodyHtml}
</main>
<footer class="site-footer">
  <p>&copy; ${new Date().getFullYear()} D.Jaleco. <a href="https://djaleco.com.br">djaleco.com.br</a></p>
</footer>
</body>
</html>`;
}

async function main() {
  console.log('Fetching posts...');
  const posts = await fetchJSON(`${SITE}/wp-json/wp/v2/posts?per_page=100&_embed`);
  console.log(`Got ${posts.length} posts.`);

  const summaries = [];

  for (const post of posts) {
    const slug = post.slug;
    console.log(`Processing: ${slug}`);
    let content = post.content.rendered;
    const title = stripHtml(post.title.rendered);
    const excerpt = stripHtml(post.excerpt.rendered).slice(0, 160);
    const dateISO = post.date;
    const dateFmt = new Date(post.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Featured image
    let featuredLocal = null;
    const media = post._embedded?.['wp:featuredmedia']?.[0];
    if (media?.source_url) {
      featuredLocal = await downloadImage(media.source_url);
    }

    // Inline images
    const imgUrls = extractImgUrls(content);
    for (const u of imgUrls) {
      if (!u.includes('blog.djaleco.com.br')) continue;
      const local = await downloadImage(u);
      if (local) {
        content = content.split(u).join(local);
      }
    }

    const canonical = `${SITE.replace('https://blog', 'https://blog')}/${slug}/`.replace('https://blog.djaleco.com.br', 'https://blog.djaleco.com.br');

    const bodyHtml = `
<article class="post">
  <p class="breadcrumb"><a href="/">Blog</a> / ${escapeHtml(title)}</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="post-date">${dateFmt}</p>
  ${featuredLocal ? `<img class="post-cover" src="${featuredLocal}" alt="${escapeHtml(title)}">` : ''}
  <div class="post-content">${content}</div>
</article>`;

    const html = layout({
      title: `${title} | Blog D.Jaleco`,
      description: excerpt,
      canonical: `https://blog.djaleco.com.br/${slug}/`,
      ogImage: featuredLocal ? `https://blog.djaleco.com.br${featuredLocal}` : null,
      bodyHtml,
      isPost: true,
    });

    const dir = path.join(ROOT, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), html, 'utf-8');

    summaries.push({ slug, title, excerpt, dateFmt, dateISO, featuredLocal });
  }

  // Index page
  const cards = summaries
    .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))
    .map(
      (s) => `
  <a class="card" href="/${s.slug}/">
    ${s.featuredLocal ? `<img src="${s.featuredLocal}" alt="${escapeHtml(s.title)}">` : ''}
    <div class="card-body">
      <h2>${escapeHtml(s.title)}</h2>
      <p class="post-date">${s.dateFmt}</p>
      <p>${escapeHtml(s.excerpt)}</p>
    </div>
  </a>`
    )
    .join('\n');

  const indexHtml = layout({
    title: 'Blog D.Jaleco',
    description: 'Artigos sobre jalecos, moda profissional e cuidados para a área da saúde.',
    canonical: 'https://blog.djaleco.com.br/',
    ogImage: null,
    bodyHtml: `<h1 class="page-title">Blog D.Jaleco</h1>\n<div class="grid">${cards}</div>`,
    isPost: false,
  });
  await writeFile(path.join(ROOT, 'index.html'), indexHtml, 'utf-8');

  // Category page (preserve /category/jalecos/ URL)
  const catDir = path.join(ROOT, 'category', 'jalecos');
  await mkdir(catDir, { recursive: true });
  const catHtml = layout({
    title: 'Jalecos | Blog D.Jaleco',
    description: 'Artigos sobre jalecos no Blog D.Jaleco.',
    canonical: 'https://blog.djaleco.com.br/category/jalecos/',
    ogImage: null,
    bodyHtml: `<h1 class="page-title">Categoria: Jalecos</h1>\n<div class="grid">${cards}</div>`,
    isPost: false,
  });
  await writeFile(path.join(catDir, 'index.html'), catHtml, 'utf-8');

  // sitemap.xml
  const urls = ['https://blog.djaleco.com.br/', ...summaries.map((s) => `https://blog.djaleco.com.br/${s.slug}/`)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join('\n')}\n</urlset>`;
  await writeFile(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf-8');

  // robots.txt
  await writeFile(
    path.join(ROOT, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: https://blog.djaleco.com.br/sitemap.xml\n`,
    'utf-8'
  );

  console.log(`\nDone. Generated ${summaries.length} posts + index + category + sitemap.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
