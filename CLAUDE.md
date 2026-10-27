# learn 目录：动画学习页工作区

这个目录专门存放「一个知识点 = 一个 HTML 动画学习页」。

## 核心约定

只要用户表达了**想弄懂某个知识**的意图，就调用 `learn-animate` skill（`.claude/skills/learn-animate/SKILL.md`），按其流程执行。触发表达包括但不限于：

- 我要学习 XXX / 我想学 XXX / 教我 XXX / learn XXX
- 帮我解释 XXX / 解释一下 XXX / XXX 是什么意思 / 讲讲 XXX
- 我不理解 XXX / 我不懂 XXX / 没搞明白 XXX / XXX 看不懂
- XXX 和 YYY 有什么区别 / XXX 是怎么工作的 / XXX 的原理是什么
- 其他任何"不懂、想搞懂"类的说法（中英文皆可）

执行结果：

1. 按内容分类，在 `/home/opc/learn/<类目>/` 下生成**一个自包含的 HTML 文件**，用**动画**把知识点讲得尽可能浅显易懂。
2. 每个页面都必须有：**全局「重置」按钮**（一键恢复到页面最初状态）和**末尾的练习题**（即时反馈 + 解析 + 得分）。
3. 生成后，把本地链接发给用户（`file:///home/opc/learn/<类目>/<文件名>.html`），用户打开即可学习。

## 类目

| 类目 | 目录 | 内容 |
|---|---|---|
| math | `math/` | 数学 |
| english | `english/` | 英语 |
| model | `model/` | AI 模型、机器学习、大模型 |
| tech | `tech/` | 计算机技术、网络、数据结构与算法、编程 |

都不合适时先问用户，再决定是否新增类目。

页面质量标准见 `.claude/rules/learn-html.md`。

## 例外

- 用户明确要求"直接在聊天里讲"或指定其他格式（PPT、Markdown、PDF 等）时，按用户要求来。
- 用户要求修改已有学习页时，编辑对应的现有文件，而不是新建。

## 其他

- 每次新建或修改学习页后，都直接同步到网站 https://up.yiwei.love（完全公开，无需登录）：在 `/home/opc/learn` 下运行 `npm run deploy`（构建 `dist/` 并用 wrangler 部署到 Cloudflare），再 `git add -A && git commit` 留档。交付时同时给出本地链接和线上链接 `https://up.yiwei.love/<类目>/<文件名>`（不带 `.html`）。
- 部署依赖环境变量 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`；缺失或部署失败时如实告知用户，本地文件照常交付。
- 只有四个类目目录里的 `.html` 会被发布（见 `scripts/build.mjs`），首页 `index.html` 自动生成，不要手写。
- 文件名用简短的英文 kebab-case，例如 `tcp-sliding-window.html`、`rbtree.html`。生成前先 `ls` 看是否已有同主题文件。
