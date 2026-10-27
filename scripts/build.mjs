// 构建网站到 dist/：
//   /            首页：学科分类卡片 + 搜索 + 最近更新
//   /<类目>      类目页：该学科下的全部学习条目
//   /<类目>/<文件名>  学习页本身（复制时注入网站图标和左下角「返回目录」按钮，源文件不动）
//   site/ 下的文件（logo、favicon 等）原样复制到网站根目录
// 只发布上面这些，.claude/、CLAUDE.md 等不会进入 dist/。
import { readdirSync, readFileSync, statSync, rmSync, mkdirSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE = 'Up 学习站';
const CATEGORIES = [
  { id: 'math', name: '数学', glyph: '∑', desc: '代数、几何、概率统计、微积分、线性代数' },
  { id: 'english', name: '英语', glyph: 'Aa', desc: '单词辨析、语法、发音、习惯用法' },
  { id: 'model', name: 'AI 模型', glyph: 'AI', desc: '机器学习、神经网络、大模型原理' },
  { id: 'tech', name: '计算机技术', glyph: '</>', desc: '网络协议、数据结构与算法、操作系统、编程' },
];

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const fmt = (d) => d.toISOString().slice(0, 10);

// 学习页左下角的「返回目录」按钮（重置按钮都在右下角，互不遮挡）
const backLink = (cat) => `
<a id="up-back" href="/${cat.id}" aria-label="返回${cat.name}目录">← ${cat.name}</a>
<style>
#up-back{position:fixed;left:max(16px,env(safe-area-inset-left,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:2147483000;
padding:8px 14px;border-radius:999px;font:500 14px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
background:rgba(255,255,255,.92);color:#1f2328;border:1px solid rgba(0,0,0,.12);box-shadow:0 2px 8px rgba(0,0,0,.08);text-decoration:none;
-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
#up-back:hover{border-color:rgba(0,0,0,.3)}
@media (prefers-color-scheme:dark){#up-back{background:rgba(30,33,40,.92);color:#e6e8eb;border-color:rgba(255,255,255,.15)}}
@media print{#up-back{display:none}}
</style>
`;

const ICONS = '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">';

// 首页标题旁的 logo：与 site/favicon.svg 同款，打开时小球沿台阶跳上去
const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="up-logo-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4c6ef5"/><stop offset="1" stop-color="#7048e8"/></linearGradient></defs>
      <rect width="64" height="64" rx="14" fill="url(#up-logo-g)"/>
      <path d="M12 52V42a2 2 0 0 1 2-2h10V32a2 2 0 0 1 2-2h10v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v30z" fill="#fff"/>
      <path class="trail" d="M17 36Q20 25 29 26Q32 16 37 14" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="0.1 4.2" opacity=".8"/>
      <circle class="ball" cx="43" cy="13" r="5.5" fill="#ffa94d"/>
    </svg>`;

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);
cpSync(join(ROOT, 'site'), DIST, { recursive: true });

// 收集并复制学习页
const all = [];
for (const cat of CATEGORIES) {
  cat.pages = [];
  const src = join(ROOT, cat.id);
  if (!existsSync(src)) continue;
  for (const file of readdirSync(src)) {
    if (!file.endsWith('.html')) continue;
    const path = join(src, file);
    const html = readFileSync(path, 'utf8');
    const slug = file.replace(/\.html$/, '');
    const title = text(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || slug);
    const meta = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1];
    const h1 = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
    const desc = meta || (h1 && h1 !== title ? h1 : '');
    mkdirSync(join(DIST, cat.id), { recursive: true });
    let out = html.includes('</body>') ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${backLink(cat)}</body>`) : html + backLink(cat);
    if (!/rel=["']icon["']/i.test(out)) {
      out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${ICONS}\n</head>`) : out.replace(/<\/title>/i, `</title>\n${ICONS}`);
    }
    writeFileSync(join(DIST, cat.id, file), out);
    const page = { cat, href: `/${cat.id}/${slug}`, title, desc, mtime: statSync(path).mtime };
    cat.pages.push(page);
    all.push(page);
  }
  cat.pages.sort((a, b) => b.mtime - a.mtime);
}
all.sort((a, b) => b.mtime - a.mtime);

const style = `
  :root {
    --bg:#f6f5f2; --card:#ffffff; --fg:#1d2127; --muted:#6b7280; --line:#e6e4df; --shadow:0 1px 2px rgba(0,0,0,.04),0 4px 16px rgba(0,0,0,.05);
    --math:#d9480f; --math-bg:#fff1e8; --english:#2f9e44; --english-bg:#ebfbee;
    --model:#7048e8; --model-bg:#f3f0ff; --tech:#1c7ed6; --tech-bg:#e7f5ff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#121418; --card:#1b1e24; --fg:#e7e9ec; --muted:#9aa3af; --line:#2a2e36; --shadow:0 1px 2px rgba(0,0,0,.3);
      --math:#ff8a50; --math-bg:#3a2218; --english:#69db7c; --english-bg:#1b3222;
      --model:#b197fc; --model-bg:#2a2445; --tech:#74c0fc; --tech-bg:#17304a;
    }
  }
  * { box-sizing:border-box; }
  html { -webkit-text-size-adjust:100%; }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif; }
  main { max-width:880px; margin:0 auto; padding:48px 16px 72px; }
  a { color:inherit; text-decoration:none; }
  header.hero h1 { font-size:32px; line-height:1.2; margin:0 0 8px; letter-spacing:.5px; }
  .brand { display:flex; align-items:center; gap:14px; }
  .brand h1 { margin:0 !important; }
  .logo { width:52px; height:52px; flex:none; overflow:visible; }
  .logo .ball { animation:hop 1.6s .3s ease-in-out both; }
  .logo .trail { animation:fade 1.6s .3s ease-out both; }
  @keyframes hop {
    0% { transform:translate(-25px,21.5px); } 20% { transform:translate(-19px,8px); }
    40% { transform:translate(-13px,11.5px); } 60% { transform:translate(-7px,-1px); } 80%,100% { transform:translate(0,0); }
  }
  @keyframes fade { 0%,40% { opacity:0; } 100% { opacity:.8; } }
  .crumb .mini { width:18px; height:18px; vertical-align:-4px; margin-right:6px; }
  @media (prefers-reduced-motion: reduce) { .logo .ball, .logo .trail { animation:none; } }
  .sub { color:var(--muted); margin:0; }
  .crumb { font-size:14px; color:var(--muted); margin-bottom:16px; }
  .crumb a:hover { color:var(--fg); }
  h2.sec { font-size:15px; color:var(--muted); font-weight:600; margin:40px 0 12px; }

  .search { margin:28px 0 0; position:relative; }
  .search input { width:100%; font:inherit; padding:12px 16px; border-radius:12px; border:1px solid var(--line);
    background:var(--card); color:var(--fg); outline:none; box-shadow:var(--shadow); }
  .search input:focus { border-color:var(--muted); }
  .results { margin-top:12px; }

  .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-top:32px; }
  @media (max-width:600px) { .grid { grid-template-columns:1fr; } header.hero h1 { font-size:26px; } main { padding-top:32px; } }
  .cat { display:flex; flex-direction:column; gap:10px; padding:20px; border-radius:16px; background:var(--card);
    border:1px solid var(--line); box-shadow:var(--shadow); transition:transform .2s, border-color .2s; }
  a.cat:hover { transform:translateY(-2px); border-color:var(--c); }
  .cat.empty { opacity:.6; }
  .cat .top { display:flex; align-items:center; gap:12px; }
  .glyph { width:44px; height:44px; border-radius:12px; display:grid; place-items:center; flex:none;
    background:var(--cbg); color:var(--c); font:700 17px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  .glyph.lg { width:56px; height:56px; font-size:22px; border-radius:14px; }
  .cat h3 { margin:0; font-size:19px; }
  .cat .id { font-size:12px; color:var(--c); font-weight:600; letter-spacing:.5px; }
  .cat p { margin:0; color:var(--muted); font-size:14px; }
  .cat .foot { display:flex; justify-content:space-between; align-items:center; font-size:13px; color:var(--muted);
    border-top:1px dashed var(--line); padding-top:10px; margin-top:auto; }
  .cat .count { color:var(--c); font-weight:600; }

  .list { display:flex; flex-direction:column; gap:10px; }
  .item { display:flex; align-items:center; gap:14px; padding:14px 18px; border-radius:12px; background:var(--card);
    border:1px solid var(--line); box-shadow:var(--shadow); transition:border-color .2s, transform .2s; }
  .item:hover { border-color:var(--c); transform:translateX(2px); }
  .item .body { flex:1; min-width:0; }
  .item .t { font-weight:600; }
  .item .d { color:var(--muted); font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .item .meta { display:flex; flex-direction:column; align-items:flex-end; gap:2px; font-size:12px; color:var(--muted); flex:none; }
  .item .tag { color:var(--c); background:var(--cbg); padding:1px 8px; border-radius:999px; font-weight:600; }
  .item .arrow { color:var(--muted); flex:none; }
  .none { color:var(--muted); padding:24px; text-align:center; border:1px dashed var(--line); border-radius:12px; }
  .cat-head { display:flex; align-items:center; gap:16px; }
  footer { margin-top:56px; color:var(--muted); font-size:13px; text-align:center; }
  ${CATEGORIES.map((c) => `.c-${c.id}{--c:var(--${c.id});--cbg:var(--${c.id}-bg)}`).join('\n  ')}
  @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }`;

const layout = (title, body, script = '') => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="一个知识点一个页面，用动画把知识讲明白。">
${ICONS}
<style>${style}</style>
</head>
<body>
<main>
${body}
<footer>${SITE} · 一个知识点一个页面，用动画讲明白</footer>
</main>
${script}
</body>
</html>
`;

const item = (p, showCat) => `
      <a class="item c-${p.cat.id}" href="${p.href}">
        <div class="body"><div class="t">${esc(p.title)}</div>${p.desc ? `<div class="d">${esc(p.desc)}</div>` : ''}</div>
        <div class="meta">${showCat ? `<span class="tag">${p.cat.name}</span>` : ''}<time>${fmt(p.mtime)}</time></div>
        <span class="arrow" aria-hidden="true">›</span>
      </a>`;

// 首页
const cards = CATEGORIES.map((c) => {
  const inner = `
        <div class="top"><span class="glyph">${esc(c.glyph)}</span><div><div class="id">${c.id.toUpperCase()}</div><h3>${c.name}</h3></div></div>
        <p>${c.desc}</p>
        <div class="foot">${c.pages.length
          ? `<span><span class="count">${c.pages.length}</span> 篇</span><span>最近：${fmt(c.pages[0].mtime)}</span>`
          : '<span>即将上线</span>'}</div>`;
  return c.pages.length
    ? `\n      <a class="cat c-${c.id}" href="/${c.id}">${inner}\n      </a>`
    : `\n      <div class="cat empty c-${c.id}">${inner}\n      </div>`;
}).join('');

const searchData = JSON.stringify(all.map((p) => ({ i: all.indexOf(p), k: `${p.title} ${p.desc} ${p.cat.name} ${p.cat.id}`.toLowerCase() })));
const homeScript = `<script>
(function () {
  var data = ${searchData};
  var input = document.getElementById('q'), box = document.getElementById('results'), home = document.getElementById('home');
  var items = Array.prototype.slice.call(document.querySelectorAll('#all .item'));
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    if (!q) { box.hidden = true; home.hidden = false; return; }
    var hit = 0;
    data.forEach(function (d) { var ok = d.k.indexOf(q) !== -1; items[d.i].hidden = !ok; if (ok) hit++; });
    document.getElementById('none').hidden = hit > 0;
    box.hidden = false; home.hidden = true;
  });
})();
</script>`;

writeFileSync(join(DIST, 'index.html'), layout(SITE, `
  <header class="hero">
    <div class="brand">${LOGO}<h1>${SITE}</h1></div>
    <p class="sub" style="margin-top:12px">一个知识点一个页面，用动画讲明白。目前共 ${all.length} 篇，选一个学科开始吧。</p>
  </header>
  <div class="search"><input id="q" type="search" placeholder="搜索学习条目，如：红黑树、few、神经网络" autocomplete="off" aria-label="搜索学习条目"></div>
  <div id="results" class="results" hidden>
    <div id="all" class="list">${all.map((p) => item(p, true)).join('')}
    </div>
    <div id="none" class="none" hidden>没有找到相关条目</div>
  </div>
  <div id="home">
    <div class="grid">${cards}
    </div>
    ${all.length ? `<h2 class="sec">最近更新</h2>
    <div class="list">${all.slice(0, 5).map((p) => item(p, true)).join('')}
    </div>` : ''}
  </div>`, homeScript));

// 类目页
for (const c of CATEGORIES) {
  mkdirSync(join(DIST, c.id), { recursive: true });
  writeFileSync(join(DIST, c.id, 'index.html'), layout(`${c.name} · ${SITE}`, `
  <nav class="crumb"><a href="/"><img class="mini" src="/favicon.svg" alt="">${SITE}</a></nav>
  <header class="hero cat-head c-${c.id}">
    <span class="glyph lg">${esc(c.glyph)}</span>
    <div><h1>${c.name}</h1><p class="sub">${c.desc} · 共 ${c.pages.length} 篇</p></div>
  </header>
  <h2 class="sec">全部条目</h2>
  ${c.pages.length ? `<div class="list">${c.pages.map((p) => item(p, false)).join('')}
  </div>` : '<div class="none">这个学科还没有内容，敬请期待</div>'}`));
}

writeFileSync(join(DIST, '404.html'), layout(`页面不存在 · ${SITE}`, `
  <header class="hero">
    <h1>页面不存在</h1>
    <p class="sub">这个页面可能已改名或删除。<a href="/" style="text-decoration:underline">回到首页</a></p>
  </header>`));

console.log(`built ${all.length} pages into dist/ (${CATEGORIES.map((c) => `${c.id}:${c.pages.length}`).join(' ')})`);
