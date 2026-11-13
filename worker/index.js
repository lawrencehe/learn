// 登录门禁：所有请求先经过这里，登录后才返回 dist/ 里的静态页面。
// 账号密码是 Cloudflare 上的两个 secret（不进 git）：
//   npm run cf -- secret put AUTH_USER
//   npm run cf -- secret put AUTH_PASS
// 登录成功后发一个签名 Cookie，15 天有效；改密码后所有已登录设备都会失效。
import { tokens } from '../scripts/shell.mjs';

const COOKIE = 'up_session';
const MAX_AGE = 15 * 24 * 3600; // 15 天（秒）
const PUBLIC = new Set(['/favicon.svg', '/apple-touch-icon.png']); // 登录页本身要用的图标

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(`up-learn:${env.AUTH_USER}:${env.AUTH_PASS}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

// 先各自做 SHA-256 变成等长，再做时间恒定比较，避免按耗时猜密码
async function same(a, b) {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(String(s)))));
  return crypto.subtle.timingSafeEqual(x, y);
}

async function makeToken(env) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  return `${exp}.${await hmac(env, `session|${exp}`)}`;
}

async function validToken(env, token) {
  const m = /^(\d+)\.([0-9a-f]{64})$/.exec(token || '');
  if (!m || Number(m[1]) < Date.now() / 1000) return false;
  return same(m[2], await hmac(env, `session|${m[1]}`));
}

function getCookie(req, name) {
  for (const part of (req.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i !== -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

// 只允许跳回本站路径，防止 ?next=//evil.com 这类开放跳转
const safeNext = (s) => (typeof s === 'string' && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/');

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function loginPage(next, error, status = 200) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>登录 · up</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>
${tokens()}
:root{--accent:#4c6ef5}
@media (prefers-color-scheme:dark){:root{--accent:#91a7ff}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--up-bg);color:var(--up-ink);font:16px/1.5 var(--up-font)}
.card{width:100%;max-width:360px;background:var(--up-surface);border:1px solid var(--up-line);border-radius:16px;box-shadow:var(--up-shadow);padding:28px 24px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.brand img{width:36px;height:36px}
h1{margin:0;font-size:22px}
label{display:block;font-size:14px;color:var(--up-muted);margin:14px 0 6px}
input{width:100%;font:inherit;padding:10px 12px;border-radius:10px;border:1.5px solid var(--up-line);background:var(--up-surface-2);color:var(--up-ink);outline:none}
input:focus{border-color:var(--accent)}
button{width:100%;margin-top:22px;font:600 16px/1 var(--up-font);padding:12px;border:0;border-radius:10px;background:var(--accent);color:var(--up-surface);cursor:pointer}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.err{margin:14px 0 0;color:var(--up-bad);font-size:14px}
.hint{margin:16px 0 0;color:var(--up-muted);font-size:13px;text-align:center}
</style>
</head>
<body>
<form class="card" method="post" action="/login">
  <div class="brand"><img src="/favicon.svg" alt=""><h1>up · 登录</h1></div>
  <input type="hidden" name="next" value="${esc(next)}">
  <label for="u">账号</label>
  <input id="u" name="username" autocomplete="username" required autofocus>
  <label for="p">密码</label>
  <input id="p" name="password" type="password" autocomplete="current-password" required>
  ${error ? `<p class="err">${esc(error)}</p>` : ''}
  <button type="submit">登录</button>
  <p class="hint">登录后 15 天内免登录</p>
</form>
</body>
</html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

const redirect = (to, cookie) => {
  const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  if (cookie) h.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers: h });
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    // 没配置账号密码时一律拒绝（宁可打不开，也不裸奔）
    if (!env.AUTH_USER || !env.AUTH_PASS) {
      return new Response('站点未配置登录账号（缺少 AUTH_USER / AUTH_PASS）', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    if (PUBLIC.has(path)) return env.ASSETS.fetch(req);

    if (path === '/login') {
      if (req.method === 'POST') {
        const form = await req.formData().catch(() => null);
        const next = safeNext(form?.get('next'));
        const okUser = await same(form?.get('username') ?? '', env.AUTH_USER);
        const okPass = await same(form?.get('password') ?? '', env.AUTH_PASS);
        if (okUser && okPass) {
          return redirect(next, `${COOKIE}=${await makeToken(env)}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`);
        }
        await new Promise((r) => setTimeout(r, 1000)); // 输错时慢一点，拖慢暴力猜测
        return loginPage(next, '账号或密码不对', 401);
      }
      const next = safeNext(url.searchParams.get('next'));
      if (await validToken(env, getCookie(req, COOKIE))) return redirect(next);
      return loginPage(next);
    }

    if (path === '/logout') {
      return redirect('/login', `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
    }

    if (!(await validToken(env, getCookie(req, COOKIE)))) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        return redirect(`/login?next=${encodeURIComponent(path + url.search)}`);
      }
      return new Response('需要登录', { status: 401 });
    }

    // 已登录：返回静态页面，并禁止浏览器/代理之间共享缓存
    const res = await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'private, no-cache');
    return out;
  },
};
