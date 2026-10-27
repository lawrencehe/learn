#!/usr/bin/env python3
"""给学习页生成发音音频，并以 base64 mp3 内嵌回页面。

用法：npm run tts -- english/ed-pronunciation.html [--force] [--engine=google|kokoro]

引擎：
- google（默认）：Google Cloud TTS Neural2，美音 en-US-Neural2-F + 英音 en-GB-Neural2-A。
  key 从 ~/.config/google/tts.env 的 GOOGLE_TTS_API_KEY 读取（切勿输出其内容）。
  普通单词交给 Google 自己判断读音；清单里手动指定了音标的词用 SSML <phoneme> 强制。
- kokoro：本地离线模型（~/.local/share/kokoro/），没有 Google key 时自动退回它。

页面约定：
- 所有 data-say="word|word2" 属性里的单词都会生成音频（含 ${...} 的模板值会跳过）。
- 可选清单 <script type="application/json" id="audio-words">：
    {"words": [...JS 里动态用到的词...],
     "phonemes": {"close": {"us": "klˈoʊz", "gb": "klˈəʊz"}}}   # 有歧义时手动指定音标（IPA）
- 生成结果写入 <script type="application/json" id="audio-data">{"us": {...}, "gb": {...}}</script>，
  键是小写单词，值是 base64 mp3。引擎、音色、音标都没变的音频会复用，--force 全部重新生成。
"""
import base64, json, os, re, sys, urllib.request, urllib.error, html as htmlmod
from pathlib import Path

SPEED = 0.9
KOKORO_DIR = Path.home() / ".local/share/kokoro"
KOKORO_VOICES = {"us": ("af_heart", "en-us"), "gb": ("bf_emma", "en-gb")}
BITRATE = 40
GOOGLE_ENV = Path.home() / ".config/google/tts.env"
GOOGLE_VOICES = {"us": ("en-US-Neural2-F", "en-US"), "gb": ("en-GB-Neural2-A", "en-GB")}

def google_key():
    if os.environ.get("GOOGLE_TTS_API_KEY"):
        return os.environ["GOOGLE_TTS_API_KEY"]
    if GOOGLE_ENV.exists():
        for line in GOOGLE_ENV.read_text().splitlines():
            k, _, v = line.partition("=")
            if k.strip() == "GOOGLE_TTS_API_KEY" and v.strip():
                return v.strip().strip('"\'')
    return None

def google_engine(key):
    def synth(acc, word, ipa):
        name, lang = GOOGLE_VOICES[acc]
        if ipa:
            inp = {"ssml": f'<speak><phoneme alphabet="ipa" ph="{htmlmod.escape(ipa)}">{htmlmod.escape(word)}</phoneme></speak>'}
        else:
            inp = {"text": word}
        body = {"input": inp, "voice": {"languageCode": lang, "name": name},
                "audioConfig": {"audioEncoding": "MP3", "speakingRate": SPEED}}
        req = urllib.request.Request("https://texttospeech.googleapis.com/v1/text:synthesize",
            data=json.dumps(body).encode(), headers={"X-Goog-Api-Key": key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)["audioContent"]
        except urllib.error.HTTPError as e:
            sys.exit(f"Google TTS 出错（{word}）：HTTP {e.code} {e.read().decode()[:300]}")
    # 来源标签：引擎 + 音色 + 音标（未指定音标时为 text），用于判断能否复用
    tag = lambda acc, word, ipa: f"google:{GOOGLE_VOICES[acc][0]}:{ipa or 'text'}"
    return synth, tag

def kokoro_engine():
    import lameenc, numpy as np
    from kokoro_onnx import Kokoro
    k = Kokoro(str(KOKORO_DIR / "kokoro-v1.0.onnx"), str(KOKORO_DIR / "voices-v1.0.bin"))
    phon = lambda acc, word, ipa: ipa or k.tokenizer.phonemize(word, KOKORO_VOICES[acc][1])
    def synth(acc, word, ipa):
        voice, lang = KOKORO_VOICES[acc]
        samples, sr = k.create(phon(acc, word, ipa), voice=voice, speed=SPEED, lang=lang, is_phonemes=True)
        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
        enc = lameenc.Encoder()
        enc.set_bit_rate(BITRATE); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
        return base64.b64encode(enc.encode(pcm) + enc.flush()).decode()
    tag = lambda acc, word, ipa: f"kokoro:{KOKORO_VOICES[acc][0]}:{phon(acc, word, ipa)}"
    return synth, tag

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    engine = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--engine=")), None)
    if len(args) != 1 or engine not in (None, "google", "kokoro"):
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
    old_src = old.get("_src", {})

    key = google_key() if engine in (None, "google") else None
    if engine == "google" and not key:
        sys.exit(f"找不到 GOOGLE_TTS_API_KEY（{GOOGLE_ENV}）")
    if key:
        synth, tag = google_engine(key)
        print("引擎：Google Neural2")
    else:
        synth, tag = kokoro_engine()
        print("引擎：Kokoro（本地）" + ("" if engine else "，未找到 Google key"))

    out = {"_src": {}}
    made = reused = 0
    for acc in ("us", "gb"):
        out[acc] = {}
        out["_src"][acc] = {}
        for w in words:
            ipa = overrides.get(w, {}).get(acc)
            t = tag(acc, w, ipa)
            out["_src"][acc][w] = t
            if old.get(acc, {}).get(w) and old_src.get(acc, {}).get(w) == t:
                out[acc][w] = old[acc][w]; reused += 1
                continue
            out[acc][w] = synth(acc, w, ipa)
            made += 1
            print(f"{acc} {w:<16} {('/' + ipa + '/  (手动音标)') if ipa else ''}")

    blob = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    src = data_re.sub(lambda m: m.group(1) + blob + m.group(3), src, count=1)
    page.write_text(src, encoding="utf-8")
    print(f"{len(words)} 个词 × 2 种口音：新生成 {made}，复用 {reused}；音频共 {len(blob)/1024:.0f} KB")

if __name__ == "__main__":
    main()
