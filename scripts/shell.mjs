// 站点外壳：所有学习页共用的设计变量 + 顶部导航条（回首页 / 类目 / 标题 / 全局重置）。
// build.mjs 构建时把 shellBlock() 写进每个学习页 <body> 的开头（源文件和 dist 都会更新），
// 所以本地 file:// 打开和线上看到的是同一套导航条。改这里 → npm run build → 全站生效。
// 页面约定：定义 window.resetPage()，把整页恢复到初始状态；导航条的「重置」按钮调用它，再滚回顶部。

// 类目主色（首页卡片、导航条、页面里的 UI 强调色共用）
export const ACCENTS = {
  math: { light: ['#d9480f', '#fff1e8'], dark: ['#ff8a50', '#3a2218'] },
  english: { light: ['#2f9e44', '#ebfbee'], dark: ['#69db7c', '#1b3222'] },
  model: { light: ['#7048e8', '#f3f0ff'], dark: ['#b197fc', '#2a2445'] },
  tech: { light: ['#1c7ed6', '#e7f5ff'], dark: ['#74c0fc', '#17304a'] },
};

// 全站中性色 + 字体。学习页用 var(--up-*)，不要自己再定义一套背景/文字/边框色。
const NEUTRAL = {
  light: '--up-bg:#f5f6f8;--up-surface:#ffffff;--up-surface-2:#eef0f4;--up-ink:#1d2127;--up-muted:#626b78;--up-line:#dfe2e8;--up-ok:#2b8a3e;--up-bad:#d6336c;--up-shadow:0 1px 2px rgba(0,0,0,.04),0 4px 16px rgba(0,0,0,.05)',
  dark: '--up-bg:#121418;--up-surface:#1b1e24;--up-surface-2:#23272f;--up-ink:#e7e9ec;--up-muted:#9aa3af;--up-line:#2e333c;--up-ok:#69db7c;--up-bad:#ff6b9a;--up-shadow:0 1px 2px rgba(0,0,0,.3)',
};
const FONTS = `--up-font:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif;--up-mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;--up-radius:12px`;

// :root 变量。cat 给定时 --up-accent 为该类目主色；首页不传 cat。
export function tokens(cat) {
  const acc = (mode) => (cat ? `;--up-accent:${ACCENTS[cat][mode][0]};--up-accent-soft:${ACCENTS[cat][mode][1]}` : '');
  const dark = `${NEUTRAL.dark}${acc('dark')};color-scheme:dark`;
  return `:root{${NEUTRAL.light};${FONTS}${acc('light')}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}
:root[data-theme="dark"]{${dark}}`;
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const SHELL_BEGIN = '<!-- up-shell:begin（由 scripts/shell.mjs 自动生成，勿手改） -->';
export const SHELL_END = '<!-- up-shell:end -->';

const MINI_LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="up-nav-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4c6ef5"/><stop offset="1" stop-color="#7048e8"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#up-nav-g)"/><path d="M12 52V42a2 2 0 0 1 2-2h10V32a2 2 0 0 1 2-2h10v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v30z" fill="#fff"/><circle cx="43" cy="13" r="5.5" fill="#ffa94d"/></svg>`;

export function shellBlock({ site, cat, title }) {
  return `${SHELL_BEGIN}
<nav id="up-nav" aria-label="网站导航">
<a class="up-home" href="/" title="${esc(site)}首页">${MINI_LOGO}<span>${esc(site)}</span></a>
<span class="up-sep" aria-hidden="true">›</span><a class="up-cat" href="/${cat.id}">${esc(cat.name)}</a>
<span class="up-sep" aria-hidden="true">›</span><span class="up-title">${esc(title)}</span>
<button id="up-reset" type="button" title="把整页恢复到刚打开时的样子">↺ 重置</button>
</nav>
<style>
${tokens(cat.id)}
html{padding-top:52px;scroll-padding-top:64px}
#up-nav{position:fixed;top:0;left:0;right:0;z-index:2147483000;height:52px;box-sizing:border-box;display:flex;align-items:center;gap:8px;
padding:0 max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px));border-top:3px solid var(--up-accent);
border-bottom:1px solid var(--up-line);background:color-mix(in srgb,var(--up-surface) 88%,transparent);
-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font:500 14px/1.2 var(--up-font);color:var(--up-ink);text-align:left}
#up-nav a{color:inherit;text-decoration:none;display:flex;align-items:center;gap:8px;white-space:nowrap;flex:none}
#up-nav a:hover{color:var(--up-accent)}
#up-nav svg{width:24px;height:24px;flex:none;display:block}
#up-nav .up-home span{font-weight:700}
#up-nav .up-cat{color:var(--up-accent);font-weight:600}
#up-nav .up-sep{color:var(--up-muted);flex:none}
#up-nav .up-title{color:var(--up-muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#up-reset{margin:0 0 0 auto;flex:none;font:600 14px/1 var(--up-font);padding:8px 14px;border-radius:999px;cursor:pointer;
border:1.5px solid var(--up-accent);background:transparent;color:var(--up-accent);transition:background .2s,color .2s}
#up-reset:hover,#up-reset:focus-visible{background:var(--up-accent);color:var(--up-surface)}
#up-reset:focus-visible,#up-nav a:focus-visible{outline:2px solid var(--up-accent);outline-offset:2px}
@media (max-width:560px){#up-nav .up-home span{display:none}}
@media print{#up-nav{display:none}html{padding-top:0}}
</style>
<script>
document.getElementById('up-reset').addEventListener('click', function () {
  if (typeof window.resetPage === 'function') window.resetPage();
  else console.warn('本页没有定义 window.resetPage()，重置按钮无效');
  window.scrollTo({ top: 0, behavior: 'auto' });
});
</script>
${SHELL_END}`;
}

// 把外壳写进页面：先去掉旧的外壳块，再插到 <body> 开头。没有 <body> 的片段原样返回（build 会报警告）
export function applyShell(html, opts) {
  const start = html.indexOf(SHELL_BEGIN);
  const end = html.indexOf(SHELL_END);
  let out = html;
  if (start !== -1 && end > start) out = html.slice(0, start).replace(/\n$/, '') + html.slice(end + SHELL_END.length);
  // 从 </head> 之后找 <body>，避免误中 head 里注释或字符串中的 "<body>"
  const headEnd = out.search(/<\/head>/i);
  const from = headEnd === -1 ? 0 : headEnd;
  const m = /<body[^>]*>\n?/i.exec(out.slice(from));
  if (!m) return html;
  const at = from + m.index;
  return `${out.slice(0, at)}${m[0].replace(/\n$/, '')}\n${shellBlock(opts)}\n${out.slice(at + m[0].length)}`;
}
