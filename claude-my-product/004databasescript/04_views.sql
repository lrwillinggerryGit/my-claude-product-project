-- =============================================================================
-- 04_views.sql —— 便捷视图（对应前端各页面的常用查询）
-- =============================================================================
-- 幂等：CREATE OR REPLACE VIEW。
-- 运行（须先执行 01_schema.sql）：
--   psql -h 127.0.0.1 -U postgres -d finance_manager -f 04_views.sql
-- =============================================================================

SET search_path TO finance_manager, public;

-- ---------------------------------------------------------------------------
-- 1. 交易明细视图（transactions.html / new-entry.html 最近活动）
--    join 出分类名/emoji、账户名，分类为空时展示为「其他」
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW finance_manager.v_transaction_detail AS
SELECT
  t.id,
  t.user_id,
  t.ledger_id,
  t.type,
  t.amount,
  -- 支出以负号语义展示（前端红色-、绿色+）；此处给出带符号金额便于直接渲染
  CASE WHEN t.type = 'expense' THEN -t.amount ELSE t.amount END AS signed_amount,
  t.occurred_on,
  t.occurred_at,
  t.title,
  t.note,
  COALESCE(c.name,  '其他') AS category_name,
  COALESCE(c.emoji, '📦')  AS category_emoji,
  a.name  AS account_name,
  a.icon_emoji AS account_emoji,
  t.created_at
FROM finance_manager.transactions t
LEFT JOIN finance_manager.categories        c ON c.id = t.category_id
LEFT JOIN finance_manager.payment_accounts  a ON a.id = t.account_id;
COMMENT ON VIEW finance_manager.v_transaction_detail IS '交易明细（含分类/账户名称），分类为空显示「其他」';

-- ---------------------------------------------------------------------------
-- 2. 月度收支概览（analytics.html / transactions.html 顶部卡片）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW finance_manager.v_monthly_summary AS
SELECT
  user_id,
  ledger_id,
  date_trunc('month', occurred_on)::date AS period_month,
  SUM(amount) FILTER (WHERE type = 'income')  AS total_income,
  SUM(amount) FILTER (WHERE type = 'expense') AS total_expense,
  COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0)
    - COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS balance,
  COUNT(*) AS txn_count
FROM finance_manager.transactions
GROUP BY user_id, ledger_id, date_trunc('month', occurred_on);
COMMENT ON VIEW finance_manager.v_monthly_summary IS '按用户/账本/月聚合的收入、支出、结余';

-- ---------------------------------------------------------------------------
-- 3. 分类支出占比（analytics.html 环形图 + 明细）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW finance_manager.v_category_expense_stat AS
SELECT
  t.user_id,
  t.ledger_id,
  date_trunc('month', t.occurred_on)::date AS period_month,
  COALESCE(c.name,  '其他') AS category_name,
  COALESCE(c.emoji, '📦')  AS category_emoji,
  SUM(t.amount) AS total,
  ROUND(
    100.0 * SUM(t.amount) / NULLIF(
      SUM(SUM(t.amount)) OVER (
        PARTITION BY t.user_id, t.ledger_id, date_trunc('month', t.occurred_on)
      ), 0
    ), 1
  ) AS percentage
FROM finance_manager.transactions t
LEFT JOIN finance_manager.categories c ON c.id = t.category_id
WHERE t.type = 'expense'
GROUP BY t.user_id, t.ledger_id, date_trunc('month', t.occurred_on), c.name, c.emoji;
COMMENT ON VIEW finance_manager.v_category_expense_stat IS '各分类当月支出金额与占比（%）';

-- ---------------------------------------------------------------------------
-- 4. 预算执行进度（预算模块进度条 + 超额提醒）
--    join 当月实际支出，算出已用比例，供 <80/≥80/≥100 判定
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW finance_manager.v_budget_progress AS
SELECT
  b.id            AS budget_id,
  b.user_id,
  b.ledger_id,
  b.category_id,
  COALESCE(c.name, '总预算') AS category_name,
  b.period_month,
  b.amount        AS budget_amount,
  COALESCE(spent.used, 0) AS used_amount,
  ROUND(100.0 * COALESCE(spent.used, 0) / NULLIF(b.amount, 0), 1) AS used_percent,
  CASE
    WHEN COALESCE(spent.used, 0) >= b.amount        THEN 'over'      -- ≥100% 超额
    WHEN COALESCE(spent.used, 0) >= b.amount * 0.8  THEN 'warning'   -- ≥80%  接近
    ELSE 'normal'
  END AS status
FROM finance_manager.budgets b
LEFT JOIN finance_manager.categories c ON c.id = b.category_id
LEFT JOIN LATERAL (
  SELECT SUM(t.amount) AS used
  FROM finance_manager.transactions t
  WHERE t.ledger_id = b.ledger_id
    AND t.type = 'expense'
    AND date_trunc('month', t.occurred_on)::date = b.period_month
    -- 分类预算只统计该分类；总预算(category_id 为空)统计全部支出
    AND (b.category_id IS NULL OR t.category_id = b.category_id)
) spent ON TRUE;
COMMENT ON VIEW finance_manager.v_budget_progress IS '预算执行进度：已用/预算比例与 normal/warning/over 状态';

-- =============================================================================
-- 完成。
-- =============================================================================
