// 中考词汇（english/zhongkao-vocab.html）的学习记录，存在一个 Durable Object 里，所有设备共用一份：
//   state      { log: {批次日期: [各轮完成日期]}, wrong: {题目id: 还要答对几次}, open: {卷号: 待批改的纸质复习卷} }
//   ev:<日期>  当天的做题记录（屏幕复习、易错本、练习、纸质卷批改）
//   sheet:<卷号> 打印的纸质卷（题目、答案快照），批改时按题号对答案
// API（都在 /api/vocab/ 下，需要登录或管理口令）：
//   GET  state                    → state
//   GET  events?days=14           → {日期: [记录…]}
//   GET  sheet/<卷号>              → 纸质卷
//   POST ops {ops: [...]}          → 依次执行，返回 {state, id?}
//     {op:'miss'|'hit', id}  {op:'log', batch, day, base}  {op:'merge', log, wrong}
//     {op:'event', event}    {op:'sheet', sheet} → 返回卷号    {op:'grade', id, wrong:[题号], typed:{题号:写的答案}, day?, force?}  {op:'cancel', id}
import { DurableObject } from 'cloudflare:workers';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const EMPTY = () => ({ log: {}, wrong: {}, open: {} });

export class VocabStore extends DurableObject {
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/^\/api\/vocab/, '');
    const st = this.ctx.storage;
    const state = async () => ({ ...EMPTY(), ...((await st.get('state')) || {}) });

    if (req.method === 'GET' && p === '/state') return json(await state());
    if (req.method === 'GET' && p === '/events') {
      const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 14));
      const m = await st.list({ prefix: 'ev:', reverse: true, limit: days });
      return json(Object.fromEntries([...m].map(([k, v]) => [k.slice(3), v])));
    }
    if (req.method === 'GET' && p.startsWith('/sheet/')) {
      const s = await st.get('sheet:' + decodeURIComponent(p.slice(7)));
      return s ? json(s) : json({ error: '没有这个卷号' }, 404);
    }
    if (req.method === 'POST' && p === '/ops') {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.ops)) return json({ error: '格式不对' }, 400);
      const s = await state(), out = {};
      const addEvent = async ev => {
        const k = 'ev:' + ev.day, arr = (await st.get(k)) || [];
        arr.push({ ...ev, at: Date.now() });
        await st.put(k, arr.slice(-300));
      };
      const miss = id => { s.wrong[id] = 2; };
      const hit = id => { if (s.wrong[id]) { if (--s.wrong[id] <= 0) delete s.wrong[id]; } };
      const log = (batch, day, base) => {
        const arr = s.log[batch] || base || [];
        if (arr[arr.length - 1] !== day) arr.push(day);
        s.log[batch] = arr;
      };
      for (const op of body.ops) {
        if (op.op === 'miss') miss(op.id);
        else if (op.op === 'hit') hit(op.id);
        else if (op.op === 'log') log(op.batch, op.day, op.base);
        else if (op.op === 'merge') {
          for (const [b, arr] of Object.entries(op.log || {})) if (!s.log[b] || arr.length > s.log[b].length) s.log[b] = arr;
          for (const [id, n] of Object.entries(op.wrong || {})) s.wrong[id] = Math.max(s.wrong[id] || 0, n);
        } else if (op.op === 'event') await addEvent(op.event);
        else if (op.op === 'sheet') {
          const sh = op.sheet, seqKey = 'seq:' + sh.day, seq = ((await st.get(seqKey)) || 0) + 1;
          await st.put(seqKey, seq);
          sh.id = `${sh.day.slice(5, 7)}${sh.day.slice(8, 10)}-${seq}`;
          sh.created = Date.now();
          await st.put('sheet:' + sh.id, sh);
          if (sh.kind === 'review') s.open[sh.id] = { day: sh.day, batches: sh.mark.map(m => m.batch) };
          out.id = sh.id;
        } else if (op.op === 'cancel') {
          delete s.open[op.id];                          // 打印了但不做的复习卷：撤销后批次重新显示到期
        } else if (op.op === 'grade') {
          const sh = await st.get('sheet:' + op.id);
          if (!sh) return json({ error: `没有卷号 ${op.id}` }, 404);
          if (sh.graded && !op.force) return json({ error: `卷 ${op.id} 已经批改过（${sh.graded.day}）` }, 409);
          const wrongNos = new Set((op.wrong || []).map(Number)), typed = op.typed || {}, day = op.day || sh.day;
          const wrong = [];
          sh.items.forEach((it, i) => {
            if (wrongNos.has(i + 1)) { miss(it.id); wrong.push({ no: i + 1, id: it.id, label: it.label, q: it.q, ans: it.ans, typed: typed[i + 1] || '' }); }
            else hit(it.id);
          });
          if (sh.kind === 'review') sh.mark.forEach(m => log(m.batch, day, m.base));
          delete s.open[sh.id];
          sh.graded = { day, wrong: [...wrongNos], typed, at: Date.now() };
          await st.put('sheet:' + sh.id, sh);
          await addEvent({ kind: sh.kind, src: 'paper', day, sheet: sh.id, title: sh.title, total: sh.items.length, right: sh.items.length - wrong.length, wrong, finished: true });
          out.graded = { id: sh.id, total: sh.items.length, wrong };
        }
      }
      await st.put('state', s);
      return json({ state: s, ...out });
    }
    return json({ error: 'not found' }, 404);
  }
}
