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

const STYLE =
  'body{font-family:system-ui,sans-serif;margin:0 auto;max-width:60rem;padding:1rem;color:#1f2937}' +
  'header nav a{margin-right:.75rem}' +
  '.animal-grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));padding:0;list-style:none}' +
  '.animal-card{border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem}' +
  '.muted{color:#6b7280}';

function layout(cfg: RenderConfig, title: string, content: string): string {
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
    '<title>' + esc(title) + '</title>' + themeColor + '\n<style>' + STYLE + '</style>\n</head>\n<body>\n' +
    '<header>' + logo + '\n<h1>' + esc(heroTitle) + '</h1>\n<p>' + esc(cfg.heroBody) + '</p>\n' +
    '<nav><a href="/index.html">Home</a><a href="/animals.html">Animals</a></nav>\n</header>\n<main>\n' +
    content +
    '\n</main>\n<footer class="muted">Powered by Kithlink</footer>\n</body>\n</html>'
  );
}

function animalCard(animal: RenderAnimal): string {
  const esc = escapeHtml;
  return (
    '<li class="animal-card">\n<h2>' + esc(animal.name) + '</h2>\n' +
    '<p class="muted">' + esc(animal.species) + ' · ' + esc(animal.breed ?? 'Mixed') + ' · ' +
    esc(animal.status) + '</p>\n<p>' + esc(animal.description ?? '') + '</p>\n</li>'
  );
}

function animalList(animals: RenderAnimal[]): string {
  if (animals.length === 0) return '<p>No adoptable animals right now.</p>';
  return '<ul class="animal-grid">' + animals.map(animalCard).join('\n') + '</ul>';
}

export function renderIndexHtml(cfg: RenderConfig): string {
  return layout(
    cfg,
    cfg.shelterName,
    '<section>\n<h2>Adoptable friends</h2>\n' + animalList(cfg.animals) + '\n</section>',
  );
}

export function renderAnimalsHtml(cfg: RenderConfig): string {
  return layout(
    cfg,
    'Animals · ' + cfg.shelterName,
    '<section>\n<h2>All adoptable animals</h2>\n' + animalList(cfg.animals) + '\n</section>',
  );
}

export function renderSitemapTxt(slug: string): string {
  return ['/', '/animals', '/rss.xml'].map(p => '/sites/' + slug + p).join('\n') + '\n';
}
