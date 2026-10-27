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
3. 页面做完后，**不用询问用户**，直接按下方「页面完成后：归类 + 发布」把它归入项目并部署到线上，最后把线上链接和本地链接一起发给用户。

## 页面完成后：归类 + 发布（必须）

每次新建、修改、改名或删除学习页后，都按顺序执行：

1. **归类**：页面必须放在 `/home/opc/learn/<类目>/<英文-kebab-case>.html`。在别处生成的页面（如 scratchpad、用户给的文件），要移动或复制到对应类目目录。确认 `<title>` 是简短主题名，并且有 `<meta name="description">`。
2. **新类目**（用户同意新增后才做）：创建目录，在 `scripts/build.mjs` 的 `CATEGORIES` 里加一项（id、中文名、图标字符、简介），并同步更新本文件和 `.claude/rules/learn-html.md` 里的类目表。
3. **构建**：`npm run build`。确认输出里各类目篇数符合预期，并处理 `⚠` 警告。
4. **部署**：`npm run deploy`，直接执行，不用确认。
5. **线上验证**：`curl -s -o /dev/null -w "%{http_code}" https://up.yiwei.website/<类目>/<文件名>` 返回 200，且首页能搜到这一篇。改名或删除时，旧地址会变成 404，要告诉用户。
6. **留档**：`git add -A && git commit -m "<类目>: <主题>" && git push`（远程仓库 `git@github.com:lawrencehe/learn.git`，所有项目资料——html、CLAUDE.md、skills、rules、docs、脚本等——都推送到这里）。
7. **交付**：给出线上链接 `https://up.yiwei.website/<类目>/<文件名>`（不带 `.html`）和本地链接 `file:///home/opc/learn/<类目>/<文件名>.html`。

部署失败（凭据缺失、网络问题等）时，第 1、3、6 步照常完成（push 失败同样如实报告），把报错如实告诉用户，并说明页面暂时只在本地。

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

- 线上站点：https://up.yiwei.website（Cloudflare Workers 静态资源，完全公开，无需登录）。其他 wrangler 命令用 `npm run cf -- <命令>`，例如回滚用 `npm run cf -- rollback`。
- 部署凭据 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 放在 `~/.config/cloudflare/up-learn.env`，由 `scripts/cf.sh` 读取，切勿读取或输出其内容。
- 只有四个类目目录里的 `.html` 会被发布（见 `scripts/build.mjs`），网站首页（学科分类 + 搜索 + 最近更新）和各类目目录页都由该脚本自动生成，不要手写；新增类目时同步修改脚本里的 `CATEGORIES`。网站 logo（`site/favicon.svg`、`site/apple-touch-icon.png`）和 `site/` 下其他文件原样发布到网站根目录。
- 文件名用简短的英文 kebab-case，例如 `tcp-sliding-window.html`、`rbtree.html`。生成前先 `ls` 看是否已有同主题文件。
