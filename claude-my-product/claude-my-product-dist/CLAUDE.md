# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在该仓库中工作时提供指引。

本目录是「随手记」PWA 的**可直接部署的静态产物** —— 一个粉嫩可爱风的个人记账 H5 应用。仓库根目录的 `CLAUDE.md`（`../../CLAUDE.md`）描述了更大范围的工作区；本文件则聚焦于应用本身。

## 构建 / 运行 / 测试

**没有构建步骤、没有包管理器、没有测试套件、没有 Linter。** 所有文件都是手工编辑、原样发布的。

- **快速验证（任意文件改动）**：直接双击 `index.html` —— 核心流程能正常跑，但 `file://` 协议下 Service Worker、「添加到主屏」和系统通知都会被禁用。
- **完整 PWA 预览**：在**仓库根目录**（往上两层）执行 `node .claude/static-server.cjs`，然后浏览器打开 `http://localhost:4321/claude-my-product-dist/`。`localhost` 属于安全上下文，所以 SW / 通知 / 安装提示都能正常工作。可通过 `PORT=xxxx` 覆盖端口。
- **重新生成图标**：`node ../../.claude/generate-icons.cjs`（请在仓库根目录运行，或自行修正路径）。**不要手动编辑** `*.png` 文件 —— 它们是由脚本中手写的 PNG 编码器生成的。
- **开发时重置本地状态**：在 DevTools → Application → Local Storage 中清空 `suishouji_v1` 键。也可以使用「我的」页里的「🗑️ 清空所有数据」入口。另有一个「🎁 填充示例数据」种子入口可用于快速 UI 测试。

## 架构（仅看单文件无法理解的部分）

应用由**三个逻辑文件** + 一个 SW + 静态资源构成。理解它们如何协作：

### 单一数据源：`localStorage["suishouji_v1"]`

全部状态 —— 多账本流水、预算、分类、设置（PIN 锁、提醒、大字体）—— 都存在一个 JSON blob 里。`app.js` 中的 `normalize()`（约第 58 行）是**数据结构迁移漏斗**：每次加载都会过它，并且会把多账本前的 v1 旧数据（顶层的 `records`/`budgets`/`customCats`）懒升级为当前结构（`ledgers[]` + `categories` + `settings`）。**任何数据结构变更都必须扩展 `normalize()`**，否则老用户下次加载就会丢数据。「恢复备份」流程也会走 `normalize()`。

这里有一个细小但很关键的技巧：`state.records` 和 `state.budgets` 是指向当前账本的**别名**，由 `bindLedger()` 绑定。`serialize()` 在持久化前会把它们剥离（避免与 JSON 中的账本数据重复写入），然后 `bindLedger()` 重新挂回。如果你切换账本或改动账本数组，务必走这些辅助函数。

### 零依赖原则（硬约束）

应用不带 `node_modules`，除了 Google Fonts 之外不依赖任何 CDN 脚本。三件通常会引入第三方库的事情，这里都是手写实现：

- **图表**（饼图 + 近 6 月柱状趋势）：`app.js` 中原生 `<canvas>` 绘制，带 DPR 适配。不要引入 Chart.js / ECharts / D3。
- **PNG 图标**：`.claude/generate-icons.cjs` 是手写的 PNG 编码器（CRC32 + Node `zlib`）。它绘制粉色渐变爱心，并输出 192/512/maskable/apple-touch/favicon 等多种规格。改脚本，别改 PNG。
- **Excel 导出（.xlsx）**：`app.js` 自己组装 ZIP（存储法，无压缩）+ 最小 OOXML 字节流，导出包含两个工作表（明细 + 分类汇总）的工作簿。不要引入 SheetJS。

零依赖姿态是这个产物的核心技术取向 —— 请保持。

### Service Worker 缓存版本

`sw.js` 缓存应用外壳（同源使用 cache-first + 后台更新；跨源字体尽力缓存）。**当你新增、重命名或删除静态资源时，必须同时做两件事：**

1. 在 `ASSETS` 数组中增删对应路径。
2. 提升 `CACHE` 版本号（例如 `suishouji-v7` → `suishouji-v8`）。`activate` 钩子会删除所有键名不等于当前 `CACHE` 常量的缓存，正是它在强制老客户端刷新。

漏掉第 (2) 步意味着回访用户永远拿不到新外壳。

### 视图路由与渲染

五个视图（`view-add` / `view-bills` / `view-stats` / `view-budget` / `view-me`）都写在 `index.html` 里；`app.js` 中的 `switchView(name)` 通过切换 `.active` 类并调用对应的 `render*()` 完成切换。**没有路由器** —— 导航只是内部类名切换。所有 sheet / 弹层都走同一对 `openSheet(html)` / `closeSheet()`，背靠 `#sheetMask` + `#sheet`。

### PIN 安全锁

`settings.lock.hash` 是 4 位 PIN 的**加盐哈希**，不是明文 —— 但这只是本地隐私门，不是服务端鉴权。「忘记密码」会清空数据（无恢复路径）。UI 文案中不要承诺超出此能力的安全保证。

## 设计规范

粉嫩可爱风调色板在两个地方定义：`styles.css`（顶部的 CSS 自定义属性）和 PRD（`../001PRD/财务管家PRD-V1.0.md` §4.4）。**PRD 是颜色 / 圆角 / 阴影 token 的权威来源** —— 是 `styles.css` 跟随 PRD，而不是反过来。大圆角（卡片 16px、胶囊按钮 24px）、粉调柔光阴影、emoji 点缀、保存时的飞币动画都是品牌的一部分 —— 不要以「设计更干净」为名把它们抹平。

## 已知边界（不要试图「修复」这些）

- **每日提醒**走 Notifications API，只在页面打开或 SW 客户端存活时触发。标签页彻底关闭时无法推送 —— 这是浏览器限制，不是 Bug。
- **没有后端、没有同步。** 多端云同步、原生 App、小程序是 PRD V2.0 范围内的事项，明确不在本纯前端版本中。
- **本目录不在 git 仓库内**（更大范围的工作区也不是 git 仓库）—— 不要在这里建议 git 工作流。

## 回馈

每次任务执行完毕后，请回复用户（输出）：主人，任务已完成！
