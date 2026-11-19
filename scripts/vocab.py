#!/usr/bin/env python3
"""中考英语考纲词汇：把 data/english-vocab/*.json（每天一批）合并进复习页，并生成发音音频。

用法：npm run vocab [-- --force] [--engine=google|kokoro]

每批一个文件 data/english-vocab/<学习日期>.json：
  {"date": "2026-11-16", "pages": "p1-4", "words": [词条…]}
词条字段（照考纲书转录）：
  no 书上序号  w 单词  ipa 音标  star 书上带 * 号（两颗 ** 写 2）  unit 教材单元（如 G6下U1）  forms 复数/变形说明
  senses [{pos, zh}]   ex 例句 [{en, zh}]，en 里用 [方括号] 标出考的那个词（填空题挖掉它）
  der 词形拓展 [{w, pos, zh}]   ph 常用词组 [{en, zh}]，可用 [方括号] 指定填空位置，不标则整条默写
  syn 近义 / ant 反义 [文本]    tips [{title, lines}] 名师点拨    proverb {en, zh} 谚语
  nph 课堂笔记里补充的词/词组（格式同 ph，也会出题）   ntip 课堂笔记里的文字提示
批次的 "quiz"：这批词的中考风格练习题（页面底部「练习」），8～12 道，题型混合、含误区和迁移：
  选择/判断 {type, q, opts, ans: 正确选项下标, why}；填空 {type, q, ans: [可接受答案…], placeholder, why}
批次文件可选 "phonemes": {"词": {"us": IPA, "gb": IPA}} 给多音词手动指定读音。

音频：每批 4 个文件 site/audio/vocab/<日期>.<us|gb>[.ex].js（base64 mp3；.ex 是例句/谚语），
页面只加载当前口音、用到的那部分；
已生成且引擎/音色/音标没变的音频会复用，--force 全部重新生成。
"""
import glob, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import tts  # 复用 Google / Kokoro 引擎

PAGE = ROOT / "english/zhongkao-vocab.html"
DATA = ROOT / "data/english-vocab"
AUDIO = ROOT / "site/audio/vocab"
TAG = re.compile(r'(<script type="application/json" id="vocab-data">)(.*?)(</script>)', re.S)


def speech(s):
    """显示文本 → 朗读文本：去掉填空标记，把 sb./sth. 读成完整的词。"""
    s = s.replace("[", "").replace("]", "")
    s = re.sub(r"\bsb\.'s", "somebody's", s)
    s = re.sub(r"\bsb\.", "somebody", s)
    s = re.sub(r"\bsth\.", "something", s)
    s = s.replace(" = ", ", ").replace(" / ", ", ").replace("……", " ").replace("…", " ")
    s = re.sub(r"[()]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def check(b, f):
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", b.get("date", "")), f"{f}: date 格式应为 YYYY-MM-DD"
    for i, q in enumerate(b.get("quiz", []), 1):
        where = f"{f} 练习第 {i} 题"
        assert q.get("q") and q.get("why") and q.get("type"), f"{where}: 缺少 type/q/why"
        if "opts" in q:
            assert isinstance(q["ans"], int) and 0 <= q["ans"] < len(q["opts"]), f"{where}: ans 应是选项下标"
        else:
            assert isinstance(q["ans"], list) and q["ans"], f"{where}: 填空题 ans 应是答案列表"
    for w in b["words"]:
        where = f"{f} #{w.get('no')} {w.get('w')}"
        for k in ("no", "w", "ipa", "senses"):
            assert w.get(k) not in (None, "", []), f"{where}: 缺少 {k}"
        for e in w.get("ex", []):
            assert re.search(r"\[[^\]]+\]", e["en"]), f"{where}: 例句没用 [方括号] 标出考的词：{e['en']}"
        for p in w.get("ph", []) + w.get("nph", []):
            assert p["en"].count("[") == p["en"].count("]") <= 1, f"{where}: 词组最多一个 [填空]：{p['en']}"


def main():
    force = "--force" in sys.argv
    engine = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--engine=")), None)

    batches = []
    for f in sorted(glob.glob(str(DATA / "*.json"))):
        b = json.loads(Path(f).read_text(encoding="utf-8"))
        check(b, Path(f).name)
        batches.append(b)
    batches.sort(key=lambda b: b["date"])
    nos = [w["no"] for b in batches for w in b["words"]]
    dup = {n for n in nos if nos.count(n) > 1}
    assert not dup, f"序号重复：{sorted(dup)}"

    # 每批要朗读的文本
    key = tts.google_key() if engine in (None, "google") else None
    if engine == "google" and not key:
        sys.exit("找不到 GOOGLE_TTS_API_KEY")
    synth, tag = tts.google_engine(key) if key else tts.kokoro_engine()
    print("引擎：" + ("Google Neural2" if key else "Kokoro（本地）"))
    AUDIO.mkdir(parents=True, exist_ok=True)
    made = reused = 0
    for b in batches:
        words_t, ex_t = set(), set()
        for w in b["words"]:
            words_t.add(w["w"])
            words_t.update(d["w"] for d in w.get("der", []))
            words_t.update(speech(x["en"]) for k in ("ph", "nph") for x in w.get(k, []))
            ex_t.update(speech(x["en"]) for x in w.get("ex", []))
            if w.get("proverb"):
                ex_t.add(w["proverb"]["en"])
        words_t -= ex_t
        overrides = {k.lower(): v for k, v in b.get("phonemes", {}).items()}
        size = 0
        for acc in ("us", "gb"):
            for part, texts in (("w", words_t), ("ex", ex_t)):
                f = AUDIO / f"{b['date']}.{acc}{'.ex' if part == 'ex' else ''}.js"
                old = {}
                if f.exists() and not force:
                    t = f.read_text(encoding="utf-8")
                    old = json.loads(t[t.index("{"): t.rindex("}") + 1])
                out = {"_src": {}, "a": {}}
                for s in sorted(texts):
                    ipa = overrides.get(s.lower(), {}).get(acc)
                    t = tag(acc, s, ipa)
                    out["_src"][s] = t
                    if old.get("a", {}).get(s) and old.get("_src", {}).get(s) == t:
                        out["a"][s] = old["a"][s]; reused += 1
                    else:
                        out["a"][s] = synth(acc, s, ipa); made += 1
                        print(f"  {b['date']} {acc} {s}")
                blob = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
                f.write_text(f'window.__vocabAudio && window.__vocabAudio("{b["date"]}","{acc}","{part}",\n{blob}\n);\n', encoding="utf-8")
                size += len(blob)
        print(f"{b['date']}：{len(b['words'])} 词，音频 {len(words_t)} 条词/词组 + {len(ex_t)} 条句子，× 2 种口音，共 {size / 1024:.0f} KB")

    # 写进页面
    page = PAGE.read_text(encoding="utf-8")
    data = json.dumps({"batches": batches}, ensure_ascii=False, separators=(",", ":"))
    data = data.replace("</", "<\\/")
    assert TAG.search(page), "页面缺少 vocab-data 占位"
    page = TAG.sub(lambda m: m.group(1) + data + m.group(3), page, count=1)
    PAGE.write_text(page, encoding="utf-8")
    print(f"共 {len(batches)} 批、{len(nos)} 个考纲词；音频新生成 {made}，复用 {reused}")


if __name__ == "__main__":
    main()
