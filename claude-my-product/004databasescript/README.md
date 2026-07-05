# 财务管家（随手记）数据库脚本

依据 [`001PRD/财务管家PRD-V1.0.2.md`](../001PRD/财务管家PRD-V1.0.2.md) 与 [`003frontend/`](../003frontend/) 各页面实现设计的 **PostgreSQL** 数据库脚本。

> 背景：V1.0.2 线上形态为「纯前端 + localStorage」，数据按账号分键存储（`finance_manager_v1_user_<userId>`）。本套脚本面向 **PRD 风险 #5 所述的「未来最小后端 / 云同步」**，作为服务端数据模型的权威定义，迁移路径与前端结构一一对应。

## 命名规范

脚本严格遵循以下规范（详见 `01_schema.sql` 头部注释）：

- 标识符一律小写 `snake_case`；表名用复数名词。
- 主键统一 `id`；外键为 `<被引用表单数>_id`；布尔列 `is_`/`has_` 前缀；时间戳列 `_at` 结尾、纯日期列 `_on`/`_date` 结尾。
- 枚举类型统一 `_enum` 后缀。
- 约束/对象前缀：`pk_`（主键）、`fk_`（外键）、`uq_`（唯一）、`ck_`（检查）、`idx_`（索引）、`trg_`（触发器）。
- 金额列统一 `NUMERIC(12,2)`，币种默认 `CNY`；业务表均含 `created_at`/`updated_at`。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `00_create_database.sql` | 创建 `finance_manager` 数据库（UTF8）。需连到 `postgres` 库执行。 |
| `01_schema.sql` | 建表：Schema、枚举、触发器、全部业务表与索引。**幂等，可重复执行**。 |
| `02_seed.sql` | 系统预置数据：分类模板（与前端 DEFAULTS 一致）、成就定义。**幂等**。 |
| `04_views.sql` | 便捷视图：交易明细、月度概览、分类占比、预算进度。**幂等**。 |
| `03_sample_data.sql` | 演示用户 `demo` 及示例流水/预算（可选，仅本地开发）。**幂等**。 |
| `run_all.sql` | 在库内按序执行 01 → 02 → 04 → 03。 |

## 快速开始

```bash
# 1) 创建数据库（连 postgres 库）
psql -h 127.0.0.1 -U postgres -d postgres -f 00_create_database.sql

# 2) 进入 finance_manager 库并一键初始化
psql -h 127.0.0.1 -U postgres -d finance_manager -f run_all.sql
```

或分步执行：

```bash
psql -h 127.0.0.1 -U postgres -d finance_manager -f 01_schema.sql
psql -h 127.0.0.1 -U postgres -d finance_manager -f 02_seed.sql
psql -h 127.0.0.1 -U postgres -d finance_manager -f 04_views.sql
psql -h 127.0.0.1 -U postgres -d finance_manager -f 03_sample_data.sql   # 可选
```

数据库名与 schema 名统一为 `finance_manager`（语义化，对应产品「财务管家」；前端历史 localStorage 键 `finance_manager_` 前缀与之独立）。所有业务对象位于 `finance_manager` schema 下。查询前设置搜索路径：`SET search_path TO finance_manager, public;`

## 数据模型总览

```
users ──┬── user_sessions        登录会话 / token（只存哈希）
        ├── login_attempts       登录尝试审计（频控 + 锁定判定）
        ├── user_settings (1:1)  主题 / 提醒 / 安全锁 / 默认账本
        ├── user_streaks  (1:1)  连续记账天数 / 累计笔数
        ├── checkin_logs         每日打卡
        ├── user_achievements    已解锁成就 ── achievements（系统级成就定义）
        ├── categories           账号级分类（来自 category_templates 模板）
        ├── payment_accounts     支付账户（微信 / 支付宝 / 银行卡…）
        └── ledgers ──┬── transactions   收支流水（核心事实表）
                      └── budgets         月度总预算 / 分类预算
```

### 表与 PRD / 前端的对应关系

| 表 | 来源 |
| --- | --- |
| `users` | PRD §4.2.10 账号体系；密码加盐哈希、用户名唯一（大小写不敏感）、失败锁定、同意协议时间、个人资料（昵称/性别/签名/头像） |
| `user_sessions` | PRD §4.2.10.3 登录态保持（记住我 30 天 / 会话 8h） |
| `login_attempts` | PRD §4.2.10.1 频控、§4.2.10.2 连续 5 次失败锁定 15 分钟 |
| `ledgers` | 多账本；每账本独立 transactions + budgets |
| `category_templates` / `categories` | PRD §4.2.2；前端 `categories.html` / `new-entry.html` 的 DEFAULTS（居家/房租拆分、收入工资/劳务/外快/投资/红包） |
| `payment_accounts` | PRD §4.2.9；`new-entry.html` / `settings.html` 支付账户管理 |
| `transactions` | PRD §4.2.1 / §4.2.3；金额 `NUMERIC(12,2)`、单笔上限 1,000,000、商户/标题、备注 ≤50、可归属支付账户 |
| `budgets` | PRD §4.2.6；总预算 + 分类预算、可月度循环 |
| `user_settings` | PRD §4.2.8 安全锁、§4.2.7 提醒、设置页主题（深色模式）、生物识别开关 |
| `checkin_logs` / `user_streaks` / `achievements` / `user_achievements` | PRD §4.2.7 习惯激励 |

## 设计要点

- **账号级隔离**：所有业务数据以 `user_id` 外键归属账号，对应前端「分键存储、互不串扰」（PRD §4.2.8.5）。
- **金额**：统一 `NUMERIC(12,2)`，避免浮点误差；`amount > 0`，收支方向由 `type` 决定，视图 `v_transaction_detail.signed_amount` 给出带符号金额。
- **分类删除**：`transactions.category_id` 采用 `ON DELETE SET NULL`，配合视图把 `NULL` 展示为「其他」，落实 PRD「历史账单归入『其他』」。
- **密码 / token 安全**：`password_hash` 只存加盐哈希；`user_sessions.token_hash` 只存 token 哈希，绝不落库明文。
- **唯一性**：用户名用 `lower(username)` 唯一索引实现大小写不敏感全局唯一；预算用部分唯一索引区分「总预算」与「分类预算」。
- **时间戳**：所有表带 `created_at` / `updated_at`，`updated_at` 由 `set_updated_at()` 触发器自动维护。
- **幂等**：建表 `IF NOT EXISTS`、枚举用 `DO` 块、种子用 `ON CONFLICT DO NOTHING`、视图 `CREATE OR REPLACE`，重复执行不报错。

> 注：`03_sample_data.sql` 中的密码哈希为示例占位（明文 `demo123`），**切勿用于真实环境**。
