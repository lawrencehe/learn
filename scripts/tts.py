#!/usr/bin/env python3
"""用 Kokoro 给学习页生成发音音频，并以 base64 mp3 内嵌回页面。

用法：npm run tts -- english/ed-pronunciation.html [--force]

页面约定：
- 所有 data-say="word|word2" 属性里的单词都会生成音频（含 ${...} 的模板值会跳过）。
- 可选清单 <script type="application/json" id="audio-words">：
    {"words": [...JS 里动态用到的词...],
     "phonemes": {"close": {"us": "klˈoʊz", "gb": "klˈəʊz"}}}   # 有歧义时手动指定音标
- 生成结果写入 <script type="application/json" id="audio-data">{"us": {...}, "gb": {...}}</script>，
  键是小写单词，值是 base64 mp3。已有的同音标音频会复用，--force 全部重新生成。
"""
import base64, json, re, sys, html as htmlmod
from pathlib import Path

KOKORO_DIR = Path.home() / ".local/share/kokoro"
VOICES = {"us": ("af_heart", "en-us"), "gb": ("bf_emma", "en-gb")}
SPEED = 0.9
BITRATE = 40

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    page = Path(args[0])
    src = page.read_text(encoding="utf-8")

    words = set()
    for m in re.finditer(r'data-say="([^"]*)"', src):
        if "$" in m.group(1):
            continue
        words.update(w.strip() for w in htmlmod.unescape(m.group(1)).split("|") if w.strip())
    manifest = {}
    m = re.search(r'<script type="application/json" id="audio-words">(.*?)</script>', src, re.S)
    if m:
        manifest = json.loads(m.group(1))
        words.update(manifest.get("words", []))
    overrides = manifest.get("phonemes", {})
    words = sorted({w.lower() for w in words})

    data_re = re.compile(r'(<script type="application/json" id="audio-data">)(.*?)(</script>)', re.S)
    dm = data_re.search(src)
    if not dm:
        sys.exit('页面缺少 <script type="application/json" id="audio-data"></script> 占位')
    old = {} if force or not dm.group(2).strip() else json.loads(dm.group(2))
    old_ph = old.get("_phonemes", {})

    import lameenc, numpy as np
    from kokoro_onnx import Kokoro
    k = Kokoro(str(KOKORO_DIR / "kokoro-v1.0.onnx"), str(KOKORO_DIR / "voices-v1.0.bin"))

    out = {"_phonemes": {}}
    made = reused = 0
    for acc, (voice, lang) in VOICES.items():
        out[acc] = {}
        out["_phonemes"][acc] = {}
        for w in words:
            ph = overrides.get(w, {}).get(acc) or k.tokenizer.phonemize(w, lang)
            out["_phonemes"][acc][w] = ph
            if old.get(acc, {}).get(w) and old_ph.get(acc, {}).get(w) == ph:
                out[acc][w] = old[acc][w]; reused += 1
                continue
            samples, sr = k.create(ph, voice=voice, speed=SPEED, lang=lang, is_phonemes=True)
            pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
            enc = lameenc.Encoder()
            enc.set_bit_rate(BITRATE); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
            mp3 = enc.encode(pcm) + enc.flush()
            out[acc][w] = base64.b64encode(mp3).decode()
            made += 1
            print(f"{acc} {w:<16} /{ph}/{'  (手动音标)' if w in overrides else ''}")

    blob = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    src = data_re.sub(lambda m: m.group(1) + blob + m.group(3), src, count=1)
    page.write_text(src, encoding="utf-8")
    print(f"{len(words)} 个词 × {len(VOICES)} 种口音：新生成 {made}，复用 {reused}；音频共 {len(blob)/1024:.0f} KB")

if __name__ == "__main__":
    main()
