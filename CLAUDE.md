# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本文件为 Claude Code（claude.ai/code）在该仓库中工作时提供指引。

## 仓库概览

这是一个 Claude Code 的 demo/沙盒工作目录，包含三类彼此无关的产物：

1. **独立的 HTML 小游戏**，位于仓库根目录（`tetris.html`、`snake.html`）—— 单文件、无构建步骤、用浏览器直接打开即可。
2. **一个 Claude Code Skill**，位于 `.claude/skills/meetsummary/` 下 —— "会议总结助手" 技能，用于对中文会议记录进行总结并模拟上传到服务器。
3. **随手记记账 H5 应用**，位于 `claude-my-product/` 下 —— 依据 PRD 实现的粉嫩可爱风个人记账 PWA，纯前端、零依赖、零构建。

仓库里没有包管理器、没有构建系统、没有测试套件、也没有 CI。所有文件直接手动编辑。三个产物之间没有共享代码或依赖。

## `meetsummary` 技能

这是仓库里最主要的结构化组件。它的目录布局很关键，因为 Claude Code 会按此路径加载该技能：

```
.claude/skills/
├── prompt.md                       # 触发该技能的示例用户输入
└── meetsummary/
    ├── SKILL.md                    # 技能清单（frontmatter：name、description）+ 规则
    ├── references/
    │   └── 公司财务手册.md          # 财务手册 —— 财务限额的权威来源
    └── scripts/
        └── upload.py               # 模拟服务器同步的脚本
```

### 技能行为（定义在 `SKILL.md` 中）

被调用时，助手必须沿着恰好四个维度对会议进行总结，**每个维度只能用单句话精准概括**（不可拆成多条要点）：
- 参会人员
- 议题
- 决定
- 财务提醒 —— **仅当**出现财务关键词时触发。该提醒必须对照 `references/公司财务手册.md`，核查涉及的金额是否符合规范，并标注所需的审批人。

> ⚠️ **关键词口径不一致（已知漂移）**：`SKILL.md` 面向模型只列了 4 个触发词（资金 / 成本 / 采购 / 开支），而 `upload.py` 的 `FINANCE_KEYWORDS` 实际有 8 个（资金、成本、采购、开支、**预算、报销、费用、金额**）。也就是说模型判断「是否给财务提醒」与脚本扫描的触发范围并不一致。修改任意一侧的关键词时，应同步另一侧，避免漂移进一步扩大。

当用户说"上传" / "同步" / "推送到云端"时，应调用 `upload.py`，并把会议纪要作为一个被引号包裹的参数传入。

### `upload.py` —— 仅支持 Python 2

该脚本是用 **Python 2** 写的，在 Python 3 下会直接报错：
- 使用了 `reload(sys)` + `sys.setdefaultencoding('utf-8')`
- 用 `'mbcs'`（Windows ANSI 代码页）解码 `sys.argv[1]`
- 通过 `from __future__ import print_function` 做前向兼容

运行方式：
```
python upload.py "会议纪要内容"
```

脚本流程：
1. 扫描输入文本中的财务关键词（关键词列表见文件内的 `FINANCE_KEYWORDS`）。
2. 若命中，则打印一份基于 `FINANCE_RULES` 生成的警告表 —— 这些规则是 `公司财务手册.md` 的**硬编码镜像**。如果修改了手册，必须同步更新 `upload.py` 里的 `FINANCE_RULES` 字典，避免两边漂移。
3. 用 `time.sleep` 模拟上传过程，并打印一个假的 `record_id`。**没有真正的网络请求**。

### 财务手册（`references/公司财务手册.md`）

这是 IT 采购 / 出差住宿 / 商务宴请 / 日常报销 / 营销活动等各项支出限额的权威来源。`SKILL.md`（面向模型）和 `upload.py`（面向脚本）中的财务提醒逻辑都依赖于它。

## 随手记记账应用（`claude-my-product/`）

仓库里体量最大的产物。它是依据 `001PRD/财务管家PRD-V1.0.md` 实现的一个移动优先 H5 记账应用，**纯前端、零依赖、零构建**：所有数据存浏览器 `localStorage`，图表用原生 `<canvas>` 手绘，图标与 `.xlsx` 导出均由代码现场生成。

### 目录布局

```
claude-my-product/
├── 001PRD/财务管家PRD-V1.0.md       # 权威需求文档（功能、视觉规范、Roadmap 的来源）
└── claude-my-product-dist/          # 可直接部署的静态产物（= 应用本体）
    ├── index.html                   # 页面结构（记账/账单/统计/预算/我的 + 弹层 + 锁屏）
    ├── styles.css                   # 粉嫩可爱风设计系统
    ├── app.js                       # 全部逻辑（状态/存储/渲染/图表/PWA/安全锁/多账本/分类/提醒/xlsx）
    ├── sw.js                        # Service Worker（应用外壳 cache-first 离线缓存）
    ├── manifest.webmanifest         # PWA 清单
    └── *.png                        # 图标（由 .claude/generate-icons.cjs 生成，勿手改）
```

辅助脚本在仓库根 `.claude/` 下，**不属于 App 本身**：`static-server.cjs`（预览服务器）、`generate-icons.cjs`（重新生成图标）、`launch.json`（VS Code 预览配置）。

### 运行 / 预览

`file://` 直接双击 `index.html` 可用核心记账功能，但 **Service Worker、安装到主屏、系统通知会被跳过**（这些需要安全上下文）。要完整 PWA 体验，在**仓库根目录**起静态服务器：

```bash
node .claude/static-server.cjs
# 打开 http://localhost:4321/claude-my-product-dist/
```

该服务器零依赖、固定服务 `claude-my-product/` 目录、默认端口 4321（可用 `PORT` 环境变量覆盖）。

### 关键架构约定

- **单一数据源**：全部状态存于 `localStorage` 键 `suishouji_v1`，结构为「多账本（每账本独立 `records` + `budgets`）+ 全局 `categories` + `settings`」。加载时会把旧版单账本结构**自动迁移**升级，不丢数据。改数据结构时必须同步维护这条迁移路径。
- **零依赖原则是硬约束**：图表、PNG 图标编码（CRC32 + zlib）、Excel 导出（自写 ZIP + 最小 OOXML）全部手写实现，**不要引入 SheetJS、图表库等第三方依赖**——这是该产物的核心技术取向。
- **改图标**：编辑 `.claude/generate-icons.cjs` 后用 `node .claude/generate-icons.cjs` 重新生成 PNG，不要手动编辑 PNG。
- **改 SW 缓存**：`sw.js` 顶部的 `CACHE` 版本号（如 `suishouji-v7`）和 `ASSETS` 列表；新增静态资源或希望客户端刷新缓存时，需提升版本号并更新列表。
- **视觉规范以 PRD §4.4 为准**：粉嫩可爱风的配色（樱花粉 `#FF9EC4` 等）、大圆角、粉调柔光阴影在 PRD 和 `styles.css` 两处都有定义，改配色时以 PRD 为权威来源。

## HTML 小游戏

`tetris.html` 和 `snake.html` 是完全自包含的：HTML + 内联 `<style>` + 内联 `<script>`，没有任何外部依赖。要"运行"它们，只需用浏览器打开文件即可，没有构建、没有服务器、没有测试。最高分状态：`snake.html` 存在 `localStorage` 里，`tetris.html` 只保存在内存中。

目前已采用的风格约定：中文 UI 文案、渐变背景、基于 canvas 的渲染、并在屏幕上的面板里说明键盘操作。



## 回馈

每次任务执行完毕后，请回复我（输出）：主人，任务已完成！
