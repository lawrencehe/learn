"""把按书校对过的词条合并进 chinese/classical-150-words.html 的 wordsData 文本块。
用法：python3 scripts/wenyan-merge.py [批次文件]（不带参数时只把词库同步到其他页面）
批次文件格式：
  <序号> <字> <拼音> <书页码> ✓          （✓ 表示已按书校对）
  - {词性} [读音] 词义 | 例句 | 出处      （词性、读音可省；词性也可写复音词，如 {是故}）
  + 例句 | 出处                           （同一词义的更多例句）
"""
import re, sys
P = 'chinese/classical-150-words.html'
TAG = '<script type="text/plain" id="wordsData">\n'

def blocks(t):
    out, cur = {}, None
    for line in t.strip().split('\n'):
        m = re.match(r'^(\d+) ', line)
        if m: cur = int(m.group(1)); out[cur] = [line]
        elif line.strip(): out[cur].append(line)
    return out

s = open(P, encoding='utf-8').read()
a = s.index(TAG) + len(TAG); b = s.index('</script>', a)
base = blocks(s[a:b])
if len(sys.argv) < 2:
    sys.argv.append('/dev/null')
new = blocks(open(sys.argv[1], encoding='utf-8').read())
for k, v in new.items():
    assert base[k][0].split()[1] == v[0].split()[1], f'序号 {k} 的字对不上：{base[k][0]} / {v[0]}'
    for line in v[1:]:
        assert line[:2] in ('- ', '+ ') and line.count('|') in (1, 2), f'格式错误：{line}'
    base[k] = v
txt = '\n'.join('\n'.join(base[k]) for k in sorted(base)) + '\n'
open(P, 'w', encoding='utf-8').write(s[:a] + txt + s[b:])
# 同步到其他内嵌同一词库的页面（如练习题库）
import glob
for q in glob.glob('chinese/*.html'):
    if q == P: continue
    t = open(q, encoding='utf-8').read()
    if TAG not in t: continue
    c = t.index(TAG) + len(TAG); d = t.index('</script>', c)
    open(q, 'w', encoding='utf-8').write(t[:c] + txt + t[d:])
    print('已同步词库到', q)
print('合并：', ' '.join(new[k][0].split()[1] for k in sorted(new)), '| 已校对', sum(v[0].endswith('✓') for v in base.values()), '/ 150')
