// 把四个类目目录复制到 dist/，并生成首页 index.html 和 404.html。
// 只发布类目目录里的 .html，.claude/、CLAUDE.md 等不会进入 dist/。
import { readdirSync, readFileSync, statSync, rmSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const CATEGORIES = [
  { id: 'math', name: '数学' },
  { id: 'english', name: '英语' },
  { id: 'model', name: 'AI 模型' },
  { id: 'tech', name: '计算机技术' },
];

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);

const groups = [];
let total = 0;
for (const cat of CATEGORIES) {
  const src = join(ROOT, cat.id);
  if (!existsSync(src)) continue;
  const pages = [];
  for (const file of readdirSync(src)) {
    if (!file.endsWith('.html')) continue;
    const path = join(src, file);
    const html = readFileSync(path, 'utf8');
    const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || file.replace(/\.html$/, '')).trim();
    mkdirSync(join(DIST, cat.id), { recursive: true });
    copyFileSync(path, join(DIST, cat.id, file));
    pages.push({ href: `${cat.id}/${file.replace(/\.html$/, '')}`, title, mtime: statSync(path).mtime });
  }
  if (!pages.length) continue;
  pages.sort((a, b) => b.mtime - a.mtime);
  groups.push({ ...cat, pages });
  total += pages.length;
}

const fmt = (d) => d.toISOString().slice(0, 10);
const sections = groups.map((g) => `
    <section>
      <h2><span class="tag">${g.id}</span>${g.name}<small>${g.pages.length} 篇</small></h2>
      <ul>${g.pages.map((p) => `
        <li><a href="/${p.href}">${esc(p.title)}</a><time>${fmt(p.mtime)}</time></li>`).join('')}
      </ul>
    </section>`).join('');

const style = `
  :root { --bg:#f7f7f5; --card:#fff; --fg:#1f2328; --muted:#6b7280; --line:#e5e7eb; --accent:#2563eb; --tag-bg:#eef2ff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#111317; --card:#1a1d23; --fg:#e6e8eb; --muted:#9aa3af; --line:#2a2f37; --accent:#7aa7ff; --tag-bg:#1e2a44; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }
  main { max-width:760px; margin:0 auto; padding:40px 16px 64px; }
  h1 { font-size:28px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 32px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 20px; margin-bottom:20px; }
  h2 { font-size:18px; margin:0 0 8px; display:flex; align-items:center; gap:8px; }
  h2 small { margin-left:auto; color:var(--muted); font-weight:normal; font-size:13px; }
  .tag { font-size:12px; font-weight:600; padding:2px 8px; border-radius:999px; background:var(--tag-bg); color:var(--accent); }
  ul { list-style:none; margin:0; padding:0; }
  li { display:flex; gap:12px; align-items:baseline; padding:8px 0; border-top:1px solid var(--line); }
  li:first-child { border-top:0; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  time { margin-left:auto; color:var(--muted); font-size:13px; white-space:nowrap; }`;

const page = (title, body) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${style}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;

writeFileSync(join(DIST, 'index.html'), page('动画学习页', `
    <h1>动画学习页</h1>
    <p class="sub">一个知识点一个页面，用动画讲明白。共 ${total} 篇，按更新时间排列。</p>
${sections}`));

writeFileSync(join(DIST, '404.html'), page('页面不存在', `
    <h1>页面不存在</h1>
    <p class="sub">这个页面可能已改名或删除。<a href="/">回到首页</a></p>`));

console.log(`built ${total} pages into dist/`);
