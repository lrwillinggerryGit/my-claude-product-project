-- =============================================================================
-- 02_seed.sql —— 系统预置数据（分类模板、成就定义）
-- =============================================================================
-- 依据：
--   - 分类模板：003frontend 中 categories.html / new-entry.html 的 DEFAULTS
--   - 成就：PRD §4.2.7（连续记账 7 天、累计记账 100 笔等）
--
-- 幂等：使用 ON CONFLICT DO NOTHING，可重复执行。
--
-- 运行（须先执行 01_schema.sql）：
--   psql -h 127.0.0.1 -U postgres -d finance_manager -f 02_seed.sql
-- =============================================================================

SET search_path TO finance_manager, public;

-- ---------------------------------------------------------------------------
-- 1. 预置支出分类（与前端 CAT_DEFAULTS.expense 完全一致）
-- ---------------------------------------------------------------------------
INSERT INTO finance_manager.category_templates (type, name, emoji, sort_order) VALUES
  ('expense', '餐饮', '🍜', 1),
  ('expense', '购物', '🛒', 2),
  ('expense', '交通', '🚌', 3),
  ('expense', '居家', '🏠', 4),
  ('expense', '房租', '🏡', 5),
  ('expense', '娱乐', '🎬', 6),
  ('expense', '医疗', '💊', 7),
  ('expense', '教育', '📚', 8),
  ('expense', '通讯', '📱', 9),
  ('expense', '人情', '💝', 10)
ON CONFLICT (type, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. 预置收入分类（与前端 CAT_DEFAULTS.income 完全一致）
-- ---------------------------------------------------------------------------
INSERT INTO finance_manager.category_templates (type, name, emoji, sort_order) VALUES
  ('income', '工资', '💰', 1),
  ('income', '劳务', '💼', 2),
  ('income', '外快', '🧧', 3),
  ('income', '投资', '📈', 4),
  ('income', '红包', '🎁', 5)
ON CONFLICT (type, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. 成就定义（PRD §4.2.7 习惯激励）
-- ---------------------------------------------------------------------------
INSERT INTO finance_manager.achievements (code, name, description, icon_emoji, metric, threshold) VALUES
  ('STREAK_3',    '连续记账 3 天',   '连续 3 天记账，好习惯开始啦',      '🌱', 'streak_days',   3),
  ('STREAK_7',    '连续记账 7 天',   '连续 7 天记账，坚持一周真棒',      '🔥', 'streak_days',   7),
  ('STREAK_30',   '连续记账 30 天',  '连续记账满一个月，自律达人',        '👑', 'streak_days',   30),
  ('RECORDS_10',  '累计记账 10 笔',  '记满 10 笔，迈出理财第一步',       '⭐', 'total_records', 10),
  ('RECORDS_100', '累计记账 100 笔', '累计记账 100 笔，理财小能手',      '🏆', 'total_records', 100),
  ('RECORDS_500', '累计记账 500 笔', '累计记账 500 笔，记账大师',        '💎', 'total_records', 500)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 完成。可选：执行 03_sample_data.sql 灌入演示用户与示例流水。
-- =============================================================================
