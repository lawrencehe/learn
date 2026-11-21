#!/usr/bin/env python3
"""中考词汇学习记录的管理工具（读线上 /api/vocab/，管理口令在 ~/.config/cloudflare/vocab-admin.env，切勿输出）。

用法：
  python3 scripts/vocab-admin.py report [天数]          最近几天的做题记录（默认 3 天），写反馈用
  python3 scripts/vocab-admin.py state                  易错本、复习记录、待批改的纸质卷
  python3 scripts/vocab-admin.py sheet <卷号>           纸质卷的题目和答案，对照照片批改
  python3 scripts/vocab-admin.py grade <卷号> --wrong 3,7,12 [--typed "3=caculator|7=..."] [--day YYYY-MM-DD] [--force]
      批改纸质卷：列出的题号进易错本，其余算答对；复习卷同时记一轮复习（日期默认用打印那天）。
      全对就写 --wrong ""。
  python3 scripts/vocab-admin.py cancel <卷号>          打印了但不做的复习卷：撤销，批次重新显示到期
"""
import json, sys, urllib.request, urllib.error
from pathlib import Path

BASE = "https://up.yiwei.website/api/vocab"
ENV = Path.home() / ".config/cloudflare/vocab-admin.env"


def token():
    for line in ENV.read_text().splitlines():
        k, _, v = line.partition("=")
        if k.strip() == "VOCAB_ADMIN":
            return v.strip()
    sys.exit(f"{ENV} 里没有 VOCAB_ADMIN")


def call(path, body=None):
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json", "User-Agent": "vocab-admin"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()[:300]}")


def show_event(e):
    kind = {"review": "复习", "wrong": "易错本专练", "practice": "练习题"}.get(e.get("kind"), e.get("kind"))
    src = "纸质卷 " + e["sheet"] if e.get("src") == "paper" else "屏幕"
    mins = f"，用时 {round((e['t1'] - e['t0']) / 60000)} 分钟" if e.get("t0") and e.get("t1") else ""
    if e.get("kind") == "practice" and e.get("src") != "paper":
        print(f"  [{src}] 练习 {e.get('title', '')}：{e['id']} {'✓' if e['ok'] else '✗ 写/选了 ' + repr(e.get('typed', ''))}")
        return
    done = "" if e.get("finished", True) else "（没做完）"
    print(f"  [{src}] {kind} {e.get('title', '')}{done}：首答对 {e.get('right')}/{e.get('total')}{mins}")
    for w in e.get("wrong", []):
        print(f"      ✗ {w.get('no', '')} {w.get('label', '')}｜答案 {w.get('ans')}｜写了 {w.get('typed') or '—'}")


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "report":
        days = int(a[1]) if len(a) > 1 else 3
        ev = call(f"/events?days={days}")
        for day in sorted(ev):
            print(f"== {day}")
            for e in ev[day]:
                show_event(e)
        st = call("/state")
        print(f"易错本 {len(st['wrong'])} 题；待批改纸质卷：{', '.join(st['open']) or '无'}")
    elif a[0] == "state":
        print(json.dumps(call("/state"), ensure_ascii=False, indent=1))
    elif a[0] == "sheet":
        sh = call("/sheet/" + a[1])
        print(f"{sh['id']} {sh['title']}（{sh['day']} 打印，{'已批改 ' + sh['graded']['day'] if sh.get('graded') else '未批改'}）")
        for i, it in enumerate(sh["items"], 1):
            print(f"{i:>3}. {it['q']}  →  {it['ans']}   [{it['label']}]")
    elif a[0] == "grade":
        sid, opts = a[1], a[2:]
        get = lambda k: opts[opts.index(k) + 1] if k in opts else None
        wrong = [int(x) for x in (get("--wrong") or "").replace("，", ",").split(",") if x.strip()]
        typed = {}
        for part in (get("--typed") or "").split("|"):
            if "=" in part:
                k, _, v = part.partition("=")
                typed[k.strip()] = v.strip()
        op = {"op": "grade", "id": sid, "wrong": wrong, "typed": typed, "force": "--force" in opts}
        if get("--day"):
            op["day"] = get("--day")
        r = call("/ops", {"ops": [op]})
        g = r["graded"]
        print(f"已批改 {g['id']}：对 {g['total'] - len(g['wrong'])}/{g['total']}，进易错本 {len(g['wrong'])} 题；易错本现有 {len(r['state']['wrong'])} 题")
    elif a[0] == "cancel":
        call("/ops", {"ops": [{"op": "cancel", "id": a[1]}]})
        print(f"已撤销 {a[1]}")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
