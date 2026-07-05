-- =============================================================================
-- 财务管家（随手记）数据库 Schema —— PostgreSQL
-- =============================================================================
-- 依据：
--   - 001PRD/财务管家PRD-V1.0.2.md（品牌/设计系统对齐、支付账户维度、
--     账号体系 §4.2.10、记账 §4.2.1、分类 §4.2.2、账单 §4.2.3、首页 §4.2.4、
--     统计 §4.2.5、预算 §4.2.6、习惯激励 §4.2.7、数据安全 §4.2.8、
--     个人资料与支付账户 §4.2.9）
--   - 003frontend/*.html（登录/注册/首页/交易/统计/分类/记账/设置各页真实字段）
--   - 003frontend/design/DESIGN.md（Sakura Healing 设计系统）
--
-- 说明：
--   V1.0.2 线上形态为「纯前端 + localStorage」（键 finance_manager_v1 / finance_manager_categories_v1）。
--   本 schema 面向 PRD 风险 #5「未来最小后端 / 云同步」而设计，作为服务端数据模型的
--   权威定义；数据以 user_id 为粒度隔离（对应前端 finance_manager_v1_user_<userId> 分键存储）。
--
-- -----------------------------------------------------------------------------
-- 命名规范（本脚本严格遵循）：
--   1. 全部标识符使用小写 snake_case；不使用保留字、不使用大小写混写。
--   2. 数据库名与 schema 名统一为 finance_manager（前端 localStorage 键 finance_manager_ 独立）。
--   3. 表名使用复数名词（users / transactions / budgets …）。
--   4. 列名：
--        - 主键统一为 id；
--        - 外键为「被引用表单数 + _id」（user_id / ledger_id / category_id …）；
--        - 布尔列以 is_ / has_ 前缀（is_default / is_hidden …）；
--        - 时间戳列以 _at 结尾（created_at / updated_at；locked_until 例外语义）；
--        - 纯日期列以 _on / _date 结尾（occurred_on / checkin_date）。
--   5. 枚举类型统一以 _enum 结尾（txn_type_enum / gender_enum …）。
--   6. 约束/对象命名前缀：
--        - pk_<表>            主键
--        - fk_<表>_<列>       外键
--        - uq_<表>_<列…>      唯一约束 / 唯一索引
--        - ck_<表>_<语义>     检查约束
--        - idx_<表>_<列…>     普通索引
--        - trg_<表>_<动作>    触发器
--   7. 所有金额列统一 NUMERIC(12,2)，币种默认 CNY。
--   8. 所有业务表均含 created_at / updated_at；updated_at 由触发器自动维护。
--
-- 幂等：可重复执行（IF NOT EXISTS / DO 块建枚举 / CREATE OR REPLACE 函数）。
--
-- 运行：
--   psql -h 127.0.0.1 -U postgres -d finance_manager -f 01_schema.sql
--   （建库见 00_create_database.sql；预置数据见 02_seed.sql；视图见 04_views.sql）
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Schema 与搜索路径
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS finance_manager;
SET search_path TO finance_manager, public;

-- ---------------------------------------------------------------------------
-- 1. 枚举类型（统一 _enum 后缀；CREATE TYPE 无 IF NOT EXISTS，用 DO 块兜底）
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- 收支类型
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'txn_type_enum') THEN
    CREATE TYPE txn_type_enum AS ENUM ('expense', 'income');
  END IF;

  -- 性别（设置页：女 / 男 / 保密）
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender_enum') THEN
    CREATE TYPE gender_enum AS ENUM ('female', 'male', 'secret');
  END IF;

  -- 账号状态
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_enum') THEN
    CREATE TYPE user_status_enum AS ENUM ('active', 'disabled');
  END IF;

  -- 支付账户类型（记账页/设置页：微信 / 支付宝 / 银行卡 / 信用卡 / 现金 / 其他）
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_kind_enum') THEN
    CREATE TYPE account_kind_enum AS ENUM ('wechat', 'alipay', 'bank', 'credit_card', 'cash', 'other');
  END IF;

  -- 安全锁类型（PRD §4.2.8：手势 / 指纹 / 面容）
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_lock_enum') THEN
    CREATE TYPE app_lock_enum AS ENUM ('none', 'gesture', 'fingerprint', 'face');
  END IF;

  -- 主题（设置页：浅色 / 深色）
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'theme_enum') THEN
    CREATE TYPE theme_enum AS ENUM ('light', 'dark');
  END IF;

  -- 成就达成条件类型（连续天数 / 累计笔数）
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'achievement_metric_enum') THEN
    CREATE TYPE achievement_metric_enum AS ENUM ('streak_days', 'total_records');
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2. 通用触发器函数：自动维护 updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finance_manager.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 3. 账号体系（PRD §4.2.10）
-- =============================================================================

-- 3.1 用户表 -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_manager.users (
  id                 BIGINT           GENERATED ALWAYS AS IDENTITY,
  -- 用户名：4–20 位，字母/数字/下划线，须以字母或数字开头（前端正则同款）。
  -- 全局唯一且大小写不敏感 —— 唯一性由下方 uq_users_username_lower 索引保证。
  username           VARCHAR(20)      NOT NULL,
  -- 密码严禁明文：仅存加盐哈希（PRD §4.2.10.1 安全要求，建议 bcrypt / PBKDF2）。
  password_hash      TEXT             NOT NULL,
  password_salt      TEXT,                        -- bcrypt 已内含 salt 时可为空
  password_algo      VARCHAR(20)      NOT NULL DEFAULT 'bcrypt',

  -- 个人资料（设置页 §4.2.9）
  nickname           VARCHAR(50),
  gender             gender_enum,
  signature          VARCHAR(200),                -- 个性签名 ≤ 200 字
  avatar_emoji       VARCHAR(16)      DEFAULT '🐱',
  avatar_url         TEXT,                         -- 自定义头像（对象存储 URL）

  -- 合规：注册须勾选同意协议（PRD §4.2.10.1 / §4.3 合规），记录同意时间
  terms_agreed_at    TIMESTAMPTZ,

  -- 登录安全：连续 5 次失败锁定 15 分钟（PRD §4.2.10.2）
  failed_login_count INT              NOT NULL DEFAULT 0,
  locked_until       TIMESTAMPTZ,
  last_login_at      TIMESTAMPTZ,

  status             user_status_enum NOT NULL DEFAULT 'active',
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ      NOT NULL DEFAULT now(),

  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT ck_users_username_format
    CHECK (username ~ '^[A-Za-z0-9][A-Za-z0-9_]{3,19}$'),
  CONSTRAINT ck_users_failed_login_nonneg
    CHECK (failed_login_count >= 0)
);
COMMENT ON TABLE  finance_manager.users IS '用户账号：用户名+密码（加盐哈希），账号级数据隔离的根实体';
COMMENT ON COLUMN finance_manager.users.password_hash   IS '加盐哈希后的密码，严禁明文存储';
COMMENT ON COLUMN finance_manager.users.terms_agreed_at IS '同意服务协议/隐私政策的时间；注册必填项的落库证据';
COMMENT ON COLUMN finance_manager.users.locked_until    IS '锁定截止时间；now() < locked_until 时拒绝登录';

-- 用户名全局唯一、大小写不敏感
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
  ON finance_manager.users (lower(username));

DROP TRIGGER IF EXISTS trg_users_updated_at ON finance_manager.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON finance_manager.users
  FOR EACH ROW EXECUTE FUNCTION finance_manager.set_updated_at();

-- 3.2 会话/登录凭证表（PRD §4.2.10.3 登录态保持）-----------------------------
CREATE TABLE IF NOT EXISTS finance_manager.user_sessions (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY,
  user_id      BIGINT       NOT NULL,
  -- 只存 token 的哈希，绝不落库明文 token（PRD §4.2.10.3：凭证不入 URL、防 XSS）
  token_hash   TEXT         NOT NULL,
  is_remember  BOOLEAN      NOT NULL DEFAULT TRUE,  -- 勾选=30 天并自动续期；否则本次会话/8h
  expires_at   TIMESTAMPTZ  NOT NULL,
  user_agent   TEXT,
  ip_address   INET,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ,                         -- 退出登录时置位

  CONSTRAINT pk_user_sessions PRIMARY KEY (id),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES finance_manager.users (id) ON DELETE CASCADE
);
COMMENT ON TABLE finance_manager.user_sessions IS '登录会话/一次性 token（只存哈希），退出登录置 revoked_at';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sessions_token_hash ON finance_manager.user_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id        ON finance_manager.user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at     ON finance_manager.user_sessions (expires_at);

-- 3.3 登录尝试审计（PRD §4.2.10.1 频控 / §4.2.10.2 锁定的证据来源）------------
CREATE TABLE IF NOT EXISTS finance_manager.login_attempts (
  id             BIGINT       GENERATED ALWAYS AS IDENTITY,
  username_input VARCHAR(64),                        -- 记录输入的用户名（可能不存在）
  ip_address     INET,
  is_success     BOOLEAN      NOT NULL DEFAULT FALSE,
  attempted_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT pk_login_attempts PRIMARY KEY (id)
);
COMMENT ON TABLE finance_manager.login_attempts IS '登录/注册尝试审计，用于频次限制与账号锁定判定';

CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time
  ON finance_manager.login_attempts (lower(username_input), attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
  ON finance_manager.login_attempts (ip_address, attempted_at DESC);

-- =============================================================================
-- 4. 账本与分类
-- =============================================================================

-- 4.1 账本（多账本：每账本独立 transactions + budgets）------------------------
CREATE TABLE IF NOT EXISTS finance_manager.ledgers (
  id         BIGINT       GENERATED ALWAYS AS IDENTITY,
  user_id    BIGINT       NOT NULL,
  name       VARCHAR(30)  NOT NULL,
  currency   VARCHAR(8)   NOT NULL DEFAULT 'CNY',
  is_default BOOLEAN      NOT NULL DEFAULT FALSE,    -- 注册时初始化的默认账本
  sort_order INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT pk_ledgers PRIMARY KEY (id),
  CONSTRAINT fk_ledgers_user
    FOREIGN KEY (user_id) REFERENCES finance_manager.users (id) ON DELETE CASCADE,
  CONSTRAINT uq_ledgers_user_name UNIQUE (user_id, name)
);
COMMENT ON TABLE finance_manager.ledgers IS '账本：一个用户可有多个账本，交易/预算挂在账本下';

CREATE INDEX IF NOT EXISTS idx_ledgers_user_id ON finance_manager.ledgers (user_id);
-- 每个用户至多一个默认账本
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledgers_one_default
  ON finance_manager.ledgers (user_id) WHERE is_default;

DROP TRIGGER IF EXISTS trg_ledgers_updated_at ON finance_manager.ledgers;
CREATE TRIGGER trg_ledgers_updated_at BEFORE UPDATE ON finance_manager.ledgers
  FOR EACH ROW EXECUTE FUNCTION finance_manager.set_updated_at();

-- 4.2 系统预置分类模板（注册时复制到用户的 categories）------------------------
CREATE TABLE IF NOT EXISTS finance_manager.category_templates (
  id         BIGINT        GENERATED ALWAYS AS IDENTITY,
  type       txn_type_enum NOT NULL,
  name       VARCHAR(8)    NOT NULL,               -- 前端分类名 maxlength=8
  emoji      VARCHAR(16)   NOT NULL,
  sort_order INT           NOT NULL DEFAULT 0,
  is_active  BOOLEAN       NOT NULL DEFAULT TRUE,

  CONSTRAINT pk_category_templates PRIMARY KEY (id),
  CONSTRAINT uq_category_templates_type_name UNIQUE (type, name)
);
COMMENT ON TABLE finance_manager.category_templates IS '系统预置分类模板（全局），新用户注册时据此初始化个人分类';

-- 4.3 用户分类（PRD §4.2.2：分类以「账号」为粒度）-----------------------------
CREATE TABLE IF NOT EXISTS finance_manager.categories (
  id         BIGINT        GENERATED ALWAYS AS IDENTITY,
  user_id    BIGINT        NOT NULL,
  type       txn_type_enum NOT NULL,
  name       VARCHAR(8)    NOT NULL,               -- 前端 maxlength=8
  emoji      VARCHAR(16)   NOT NULL DEFAULT '🍜',
  sort_order INT           NOT NULL DEFAULT 0,
  is_hidden  BOOLEAN       NOT NULL DEFAULT FALSE, -- 支持隐藏不用的分类
  is_system  BOOLEAN       NOT NULL DEFAULT FALSE, -- 是否来自预置模板
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_categories PRIMARY KEY (id),
  CONSTRAINT fk_categories_user
    FOREIGN KEY (user_id) REFERENCES finance_manager.users (id) ON DELETE CASCADE,
  -- 同一用户下，同类型分类名不重复
  CONSTRAINT uq_categories_user_type_name UNIQUE (user_id, type, name)
);
COMMENT ON TABLE finance_manager.categories IS '用户分类：账号级，A 用户的自定义分类不出现在 B 用户下';

CREATE INDEX IF NOT EXISTS idx_categories_user_type
  ON finance_manager.categories (user_id, type) WHERE is_hidden = FALSE;

DROP TRIGGER IF EXISTS trg_categories_updated_at ON finance_manager.categories;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON finance_manager.categories
  FOR EACH ROW EXECUTE FUNCTION finance_manager.set_updated_at();

-- 4.4 支付账户（PRD §4.2.9；记账页/设置页：微信、支付宝、银行卡…）-------------
CREATE TABLE IF NOT EXISTS finance_manager.payment_accounts (
  id         BIGINT            GENERATED ALWAYS AS IDENTITY,
  user_id    BIGINT            NOT NULL,
  name       VARCHAR(30)       NOT NULL,           -- 如「微信支付」「招商银行卡」
  kind       account_kind_enum NOT NULL DEFAULT 'other',
  icon_emoji VARCHAR(16)       DEFAULT '💳',
  card_tail  VARCHAR(8),                           -- 银行卡尾号，如 8888
  is_active  BOOLEAN           NOT NULL DEFAULT TRUE,
  sort_order INT               NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT pk_payment_accounts PRIMARY KEY (id),
  CONSTRAINT fk_payment_accounts_user
    FOREIGN KEY (user_id) REFERENCES finance_manager.users (id) ON DELETE CASCADE,
  CONSTRAINT uq_payment_accounts_user_name UNIQUE (user_id, name)
);
COMMENT ON TABLE finance_manager.payment_accounts IS '支付账户，记账时可归属到某账户（PRD §4.2.9）';

CREATE INDEX IF NOT EXISTS idx_payment_accounts_user_id ON finance_manager.payment_accounts (user_id);

DROP TRIGGER IF EXISTS trg_payment_accounts_updated_at ON finance_manager.payment_accounts;
CREATE TRIGGER trg_payment_accounts_updated_at BEFORE UPDATE ON finance_manager.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION finance_manager.set_updated_at();

-- =============================================================================
-- 5. 交易流水（PRD §4.2.1 记账 / §4.2.3 账单）
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance_manager.transactions (
  id          BIGINT        GENERATED ALWAYS AS IDENTITY,
  user_id     BIGINT        NOT NULL,
  ledger_id   BIGINT        NOT NULL,
  -- 分类删除时置空：对应 PRD「历史账单归入『其他』」，展示层将 NULL 视为「其他」
  category_id BIGINT,
  account_id  BIGINT,

  type        txn_type_enum NOT NULL,
  -- 金额：正数，两位小数，单笔上限 1,000,000（PRD §4.2.1 异常处理）
  amount      NUMERIC(12,2) NOT NULL,
  occurred_on DATE          NOT NULL DEFAULT CURRENT_DATE,  -- 记账日期（按天分组统计）
  occurred_at TIMESTAMPTZ,                                  -- 可选精确时间（列表显示 12:30）
  title       VARCHAR(50),                                  -- 商户/标题，如「全食超市」
  note        VARCHAR(50),                                  -- 备注，前端 maxlength=50

  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_transactions PRIMARY KEY (id),
  CONSTRAINT fk_transactions_user
    FOREIGN KEY (user_id)     REFERENCES finance_manager.users (id)            ON DELETE CASCADE,
  CONSTRAINT fk_transactions_ledger
    FOREIGN KEY (ledger_id)   REFERENCES finance_manager.ledgers (id)          ON DELETE CASCADE,
  CONSTRAINT fk_transactions_category
    FOREIGN KEY (category_id) REFERENCES finance_manager.categories (id)       ON DELETE SET NULL,
  CONSTRAINT fk_transactions_account
    FOREIGN KEY (account_id)  REFERENCES finance_manager.payment_accounts (id) ON DELETE SET NULL,
  CONSTRAINT ck_transactions_amount_range
    CHECK (amount > 0 AND amount <= 1000000)
);
COMMENT ON TABLE  finance_manager.transactions IS '收支流水：记账的核心事实表（PRD §4.2.1 / §4.2.3）';
COMMENT ON COLUMN finance_manager.transactions.category_id IS '分类删除后置 NULL，展示为「其他」';
COMMENT ON COLUMN finance_manager.transactions.title       IS '商户/标题（V1.0.2 新增），如「全食超市」';

-- 高频查询索引：按用户+日期、账本+日期、分类、账户，以及统计组合
CREATE INDEX IF NOT EXISTS idx_transactions_user_date   ON finance_manager.transactions (user_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_date ON finance_manager.transactions (ledger_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON finance_manager.transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id  ON finance_manager.transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
  ON finance_manager.transactions (user_id, type, occurred_on);

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON finance_manager.transactions;
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON finance_manager.transactions
  FOR EACH ROW EXECUTE FUNCTION finance_manager.set_updated_at();

-- =============================================================================
-- 6. 预算（PRD §4.2.6）
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance_manager.budgets (
  id           BIGINT        GENERATED ALWAYS AS IDENTITY,
  user_id      BIGINT        NOT NULL,
  ledger_id    BIGINT        NOT NULL,
  -- category_id 为 NULL 表示「月度总预算」；非 NULL 表示「分类预算」
  category_id  BIGINT,
  period_month DATE          NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  is_auto_recur BOOLEAN      NOT NULL DEFAULT FALSE,  -- 每月自动循环
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_budgets PRIMARY KEY (id),
  CONSTRAINT fk_budgets_user
    FOREIGN KEY (user_id)     REFERENCES finance_manager.users (id)      ON DELETE CASCADE,
  CONSTRAINT fk_budgets_ledger
    FOREIGN KEY (ledger_id)   REFERENCES finance_manager.ledgers (id)    ON DELETE CASCADE,
  CONSTRAINT fk_budgets_category
    FOREIGN KEY (category_id) REFERENCES finance_manager.categories (id) ON DELETE CASCADE,
  CONSTRAINT ck_budgets_amount_positive CHECK (amount > 0),
  CONSTRAINT ck_budgets_period_first_day
    CHECK (period_month = date_trunc('month', period_month)::date)
);
COMMENT ON TABLE  finance_manager.budgets IS '预算：月度总预算(category_id 为空) 或 分类预算（PRD §4.2.6）';
COMMENT ON COLUMN finance_manager.budgets.period_month IS '预算所属月份，须为当月 1 号';

CREATE INDEX IF NOT EXISTS idx_budgets_ledger_month ON finance_manager.budgets (ledger_id, period_month);
-- 同账本同月：总预算唯一 / 每个分类预算唯一（NULL 用部分唯一索引区分）
CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_total
  ON finance_manager.budgets (ledger_id, period_month) WHERE category_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_category
  ON finance_manager.budgets (ledger_id, category_id, period_month) WHERE category_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_budgets_updated_at ON finance_manager.budgets;
CREATE TRIGGER trg_budgets_updated_at BEFORE UPDATE ON finance_manager.budgets
  FOR EACH ROW EXECUTE FUNCTION finance_manager.set_updated_at();

-- =============================================================================
-- 7. 用户设置（PRD §4.2.8 安全锁 / §4.2.7 提醒 / 设置页主题）
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance_manager.user_settings (
  user_id            BIGINT        NOT NULL,
  theme              theme_enum    NOT NULL DEFAULT 'light',
  is_reminder_on     BOOLEAN       NOT NULL DEFAULT TRUE,
  reminder_time      TIME          NOT NULL DEFAULT '21:00',   -- 默认晚 21:00 记账提醒
  app_lock           app_lock_enum NOT NULL DEFAULT 'none',
  is_biometric_on    BOOLEAN       NOT NULL DEFAULT FALSE,     -- 指纹/面容解锁开关
  default_ledger_id  BIGINT,
  default_account_id BIGINT,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_user_settings PRIMARY KEY (user_id),
  CONSTRAINT fk_user_settings_user
    FOREIGN KEY (user_id)            REFERENCES finance_manager.users (id)            ON DELETE CASCADE,
  CONSTRAINT fk_user_settings_default_ledger
    FOREIGN KEY (default_ledger_id)  REFERENCES finance_manager.ledgers (id)          ON DELETE SET NULL,
  CONSTRAINT fk_user_settings_default_account
    FOREIGN KEY (default_account_id) REFERENCES finance_manager.payment_accounts (id) ON DELETE SET NULL
);
COMMENT ON TABLE finance_manager.user_settings IS '用户偏好设置：主题、提醒、安全锁、默认账本/账户（一对一）';

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON finance_manager.user_settings;
CREATE TRIGGER trg_user_settings_updated_at BEFORE UPDATE ON finance_manager.user_settings
  FOR EACH ROW EXECUTE FUNCTION finance_manager.set_updated_at();

-- =============================================================================
-- 8. 习惯激励（PRD §4.2.7：连续打卡 + 成就）
-- =============================================================================

-- 8.1 记账打卡（每天一条，用于计算连续记账天数）------------------------------
CREATE TABLE IF NOT EXISTS finance_manager.checkin_logs (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY,
  user_id      BIGINT      NOT NULL,
  checkin_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pk_checkin_logs PRIMARY KEY (id),
  CONSTRAINT fk_checkin_logs_user
    FOREIGN KEY (user_id) REFERENCES finance_manager.users (id) ON DELETE CASCADE,
  CONSTRAINT uq_checkin_logs_user_date UNIQUE (user_id, checkin_date)
);
COMMENT ON TABLE finance_manager.checkin_logs IS '记账打卡日志：每用户每天至多一条';

CREATE INDEX IF NOT EXISTS idx_checkin_logs_user_date ON finance_manager.checkin_logs (user_id, checkin_date DESC);

-- 8.2 连续记账统计（冗余汇总，避免每次全表扫描）------------------------------
CREATE TABLE IF NOT EXISTS finance_manager.user_streaks (
  user_id           BIGINT      NOT NULL,
  current_streak    INT         NOT NULL DEFAULT 0,   -- 当前连续记账天数
  longest_streak    INT         NOT NULL DEFAULT 0,   -- 历史最长连续天数
  last_checkin_date DATE,
  total_records     INT         NOT NULL DEFAULT 0,   -- 累计记账笔数
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pk_user_streaks PRIMARY KEY (user_id),
  CONSTRAINT fk_user_streaks_user
    FOREIGN KEY (user_id) REFERENCES finance_manager.users (id) ON DELETE CASCADE,
  CONSTRAINT ck_user_streaks_nonneg
    CHECK (current_streak >= 0 AND longest_streak >= 0 AND total_records >= 0)
);
COMMENT ON TABLE finance_manager.user_streaks IS '连续记账/累计笔数汇总，供激励与成就判定';

DROP TRIGGER IF EXISTS trg_user_streaks_updated_at ON finance_manager.user_streaks;
CREATE TRIGGER trg_user_streaks_updated_at BEFORE UPDATE ON finance_manager.user_streaks
  FOR EACH ROW EXECUTE FUNCTION finance_manager.set_updated_at();

-- 8.3 成就定义（系统级）------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_manager.achievements (
  id          BIGINT                  GENERATED ALWAYS AS IDENTITY,
  code        VARCHAR(40)             NOT NULL,          -- 稳定标识，如 STREAK_7
  name        VARCHAR(40)             NOT NULL,          -- 如「连续记账 7 天」
  description VARCHAR(200),
  icon_emoji  VARCHAR(16)             DEFAULT '⭐',
  metric      achievement_metric_enum NOT NULL,
  threshold   INT                     NOT NULL,

  CONSTRAINT pk_achievements PRIMARY KEY (id),
  CONSTRAINT uq_achievements_code UNIQUE (code),
  CONSTRAINT ck_achievements_threshold_positive CHECK (threshold > 0)
);
COMMENT ON TABLE finance_manager.achievements IS '成就定义（全局），如连续记账 7 天、累计 100 笔';

-- 8.4 用户已解锁成就 ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_manager.user_achievements (
  id             BIGINT      GENERATED ALWAYS AS IDENTITY,
  user_id        BIGINT      NOT NULL,
  achievement_id BIGINT      NOT NULL,
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pk_user_achievements PRIMARY KEY (id),
  CONSTRAINT fk_user_achievements_user
    FOREIGN KEY (user_id)        REFERENCES finance_manager.users (id)        ON DELETE CASCADE,
  CONSTRAINT fk_user_achievements_achievement
    FOREIGN KEY (achievement_id) REFERENCES finance_manager.achievements (id) ON DELETE CASCADE,
  CONSTRAINT uq_user_achievements_user_ach UNIQUE (user_id, achievement_id)
);
COMMENT ON TABLE finance_manager.user_achievements IS '用户已解锁成就记录';

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON finance_manager.user_achievements (user_id);

-- =============================================================================
-- 完成。系统预置数据（分类模板、成就）见 02_seed.sql；便捷视图见 04_views.sql。
-- =============================================================================
