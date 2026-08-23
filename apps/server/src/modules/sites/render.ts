export interface RenderAnimal {
  name: string;
  species: string;
  breed: string | null;
  status: string;
  description: string | null;
}

export interface RenderBrand {
  logoUrl?: string;
  primaryColor?: string;
}

export interface RenderConfig {
  shelterName: string;
  slug: string;
  heroTitle: string;
  heroBody: string;
  brand: RenderBrand;
  animals: RenderAnimal[];
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ESCAPES[ch]!);
}

const JSON_LD_ESCAPES: Record<string, string> = {
  '&': '\\u0026',
  '<': '\\u003c',
  '>': '\\u003e',
};

function toJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/[&<>]/g, ch => JSON_LD_ESCAPES[ch]!);
}

function jsonLdScript(value: unknown): string {
  return '<script type="application/ld+json">' + toJsonLd(value) + '</script>';
}

const STYLE =
  ':root{color-scheme:light dark;' +
  '--bg:#fafaf9;--surface:#fff;--text:#1c1917;--muted:#57534e;--border:#e7e5e4;' +
  '--primary:#c2410c;--primary-strong:#9a3412;--primary-soft:#fef0e7;' +
  '--ok:#15803d;--warn:#b45309;--accent:#0f766e;--danger:#b91c1c;' +
  '--shadow-1:0 1px 2px rgb(0 0 0/.06)}' +
  '@media(prefers-color-scheme:dark){:root{' +
  '--bg:#141210;--surface:#1e1b18;--text:#e7e5e4;--muted:#a8a29e;--border:#33302b;' +
  '--primary:#ea7b45;--primary-strong:#f09a6a;--primary-soft:#3a2317;' +
  '--ok:#4ade80;--warn:#fbbf24;--accent:#2dd4bf;--danger:#f87171}}' +
  '*{box-sizing:border-box}' +
  'body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:16px;line-height:1.6}' +
  '.wrap{max-width:60rem;margin-inline:auto;padding:0 1.25rem}' +
  'a{color:var(--primary);text-decoration-thickness:1px;text-underline-offset:3px}' +
  '.site-header{border-bottom:1px solid var(--border);background:var(--surface)}' +
  '.site-header .wrap{padding-top:1rem;padding-bottom:1.25rem;display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1.25rem}' +
  '.site-nav a{font-size:14px;font-weight:500;margin-right:.75rem}' +
  '.brand-row{display:flex;align-items:center;gap:.75rem;width:100%}' +
  '.t-display{font-size:clamp(2rem,4vw,2.75rem);line-height:1.1;font-weight:650;letter-spacing:-.02em;margin:0}' +
  '.t-title{font-size:28px;line-height:1.15;font-weight:650;letter-spacing:-.01em;margin:0 0 .35rem}' +
  '.t-lede{font-size:18px;line-height:1.55;color:var(--muted);margin:0}' +
  '.t-meta{font-size:13px;line-height:1.4;color:var(--muted);margin:0 0 .5rem}' +
  '.hero{background:var(--surface);border-bottom:1px solid var(--border)}' +
  '.hero .wrap{padding-top:48px;padding-bottom:48px}' +
  'main.wrap{padding-top:2rem;padding-bottom:3rem}' +
  'h2.section-title{font-size:20px;line-height:1.25;font-weight:650;margin:0 0 1rem}' +
  '.grid-cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));padding:0;list-style:none;margin:0 0 1rem}' +
  '.card{background:var(--surface);border-radius:12px;box-shadow:var(--shadow-1);padding:20px}' +
  '.animal-name{font-size:18px;font-weight:650;margin:0 0 .25rem}' +
  '.badge{display:inline-block;border-radius:999px;padding:.15rem .65rem;font-size:12px;font-weight:600;background:var(--bg);color:var(--muted)}' +
  '.badge-ok{background:color-mix(in srgb,var(--ok) 14%,transparent);color:var(--ok)}' +
  '.badge-warn{background:color-mix(in srgb,var(--warn) 14%,transparent);color:var(--warn)}' +
  '.badge-accent{background:var(--primary-soft);color:var(--primary-strong)}' +
  '.badge-danger{background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger)}' +
  '.empty-state{text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px;padding:32px}' +
  '.site-footer{border-top:1px solid var(--border);background:var(--surface)}' +
  '.site-footer .wrap{padding-top:1.25rem;padding-bottom:1.25rem;font-size:13px;color:var(--muted)}' +
  '@media(prefers-reduced-motion:reduce){*{transition:none!important;transform:none!important}}';

const STATUS_TONES: Record<string, string> = {
  available: 'badge-ok',
  pending: 'badge-warn',
  adopted: 'badge-accent',
};

function layout(
  cfg: RenderConfig,
  title: string,
  headExtra: string,
  content: string,
): string {
  const esc = escapeHtml;
  const heroTitle = cfg.heroTitle.trim().length > 0 ? cfg.heroTitle : cfg.shelterName;
  const themeColor = cfg.brand.primaryColor
    ? '\n<meta name="theme-color" content="' + esc(cfg.brand.primaryColor) + '">'
    : '';
  const logo = cfg.brand.logoUrl
    ? '\n<img src="' + esc(cfg.brand.logoUrl) + '" alt="' + esc(cfg.shelterName) + ' logo" height="48">'
    : '';
  return (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>' + themeColor +
    '\n<style>' + STYLE + '</style>\n' + headExtra + '\n</head>\n<body>\n' +
    '<header class="site-header">\n<div class="wrap">\n' +
    '<nav class="site-nav" aria-label="Site"><a href="/index.html">Home</a><a href="/animals.html">Animals</a></nav>\n' +
    '<div class="brand-row">' + logo + '\n<h1 class="t-display">' + esc(cfg.shelterName) + '</h1>\n</div>\n' +
    '</div>\n</header>\n' +
    '<section class="hero">\n<div class="wrap">\n<h2 class="t-title">' + esc(heroTitle) + '</h2>\n' +
    '<p class="t-lede">' + esc(cfg.heroBody) + '</p>\n</div>\n</section>\n' +
    '<main class="wrap">\n' + content + '\n</main>\n' +
    '<footer class="site-footer"><div class="wrap">Powered by <a href="https://github.com/Krishnacore/kithlink">Kithlink</a></div></footer>\n' +
    '</body>\n</html>'
  );
}

function animalCard(animal: RenderAnimal): string {
  const esc = escapeHtml;
  const tone = STATUS_TONES[animal.status] ?? '';
  const badgeClass = tone.length > 0 ? 'badge ' + tone : 'badge';
  return (
    '<li class="card">\n<h2 class="animal-name">' + esc(animal.name) + '</h2>\n' +
    '<p class="t-meta">' + esc(animal.species) + ' · ' + esc(animal.breed ?? 'Mixed') + '</p>\n' +
    '<span class="' + badgeClass + '">' + esc(animal.status) + '</span>\n' +
    (animal.description ? '\n<p>' + esc(animal.description) + '</p>' : '') +
    '\n</li>'
  );
}

function animalList(animals: RenderAnimal[]): string {
  if (animals.length === 0) return '<p class="empty-state">No adoptable animals right now.</p>';
  return '<ul class="grid-cards">' + animals.map(animalCard).join('\n') + '</ul>';
}

function ngoJsonLd(cfg: RenderConfig): string {
  return jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: cfg.shelterName,
    description: cfg.heroBody,
  });
}

function animalsJsonLd(cfg: RenderConfig): string {
  return jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: cfg.animals.map((animal, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: { '@type': 'Thing', name: animal.name, species: animal.species },
    })),
  });
}

export function renderIndexHtml(cfg: RenderConfig): string {
  return layout(
    cfg,
    cfg.shelterName,
    ngoJsonLd(cfg),
    '<section>\n<h2 class="section-title">Adoptable friends</h2>\n' + animalList(cfg.animals) + '\n</section>',
  );
}

export function renderAnimalsHtml(cfg: RenderConfig): string {
  return layout(
    cfg,
    'Animals · ' + cfg.shelterName,
    animalsJsonLd(cfg),
    '<section>\n<h2 class="section-title">All adoptable animals</h2>\n' + animalList(cfg.animals) + '\n</section>',
  );
}

export function renderLlmsTxt(cfg: RenderConfig): string {
  const paragraph =
    cfg.heroBody.trim().length > 0
      ? cfg.heroBody.trim().replace(/\s+/g, ' ')
      : cfg.shelterName + ' is an animal shelter publishing its adoptable animals online.';
  const lines = [
    '# ' + cfg.shelterName,
    '',
    paragraph + ' Currently ' + cfg.animals.length + ' animals are available for adoption.',
    '',
    '## Available animals',
    ...(cfg.animals.length > 0
      ? cfg.animals.map(animal => '- ' + animal.name + ' (' + animal.species + ')')
      : ['- None right now. Check back soon.']),
    '',
    'RSS feed of adoptable animals: /public/v1/feed/shelters/' + cfg.slug + '/rss.xml',
  ];
  return lines.join('\n') + '\n';
}

export function renderSitemapTxt(slug: string): string {
  return ['/', '/animals', '/rss.xml'].map(p => '/sites/' + slug + p).join('\n') + '\n';
}
