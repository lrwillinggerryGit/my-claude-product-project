-- =============================================================================
-- 03_sample_data.sql —— 演示数据（可选）
-- =============================================================================
-- 创建一个演示用户 demo，为其初始化账本/分类/账户，并灌入示例流水与预算。
-- 仅用于本地开发预览，生产环境请勿执行。
--
-- 幂等：以 username=demo 为锚；已存在则整体跳过。
-- 密码占位为 bcrypt 哈希（明文 demo123，仅示例，切勿用于真实环境）。
--
-- 运行（须先执行 01_schema.sql 与 02_seed.sql）：
--   psql -h 127.0.0.1 -U postgres -d finance_manager -f 03_sample_data.sql
-- =============================================================================

SET search_path TO finance_manager, public;

DO $$
DECLARE
  v_user_id    BIGINT;
  v_ledger_id  BIGINT;
  v_acc_wechat BIGINT;
  v_acc_bank   BIGINT;
  v_cat_food   BIGINT;
  v_cat_shop   BIGINT;
  v_cat_salary BIGINT;
BEGIN
  -- 已存在则跳过，保证幂等
  IF EXISTS (SELECT 1 FROM finance_manager.users WHERE lower(username) = 'demo') THEN
    RAISE NOTICE '演示用户 demo 已存在，跳过示例数据灌入。';
    RETURN;
  END IF;

  -- 1) 用户（密码明文 demo123 的 bcrypt 哈希，示例值）
  INSERT INTO finance_manager.users (username, password_hash, password_algo, nickname, gender, signature, avatar_emoji, terms_agreed_at)
  VALUES ('demo',
          '$2b$12$C6UzMDM.H6dfI/f/IKcEeO3f0m9y6y1Q3l3l3l3l3l3l3l3l3l3l3',
          'bcrypt', '林悦', 'female', '悦享生活，理财有道。', '🐱', now())
  RETURNING id INTO v_user_id;

  -- 2) 默认账本
  INSERT INTO finance_manager.ledgers (user_id, name, is_default, sort_order)
  VALUES (v_user_id, '日常账本', TRUE, 1)
  RETURNING id INTO v_ledger_id;

  -- 3) 从预置模板复制分类到该用户
  INSERT INTO finance_manager.categories (user_id, type, name, emoji, sort_order, is_system)
  SELECT v_user_id, type, name, emoji, sort_order, TRUE
  FROM finance_manager.category_templates
  WHERE is_active;

  SELECT id INTO v_cat_food   FROM finance_manager.categories WHERE user_id = v_user_id AND type='expense' AND name='餐饮';
  SELECT id INTO v_cat_shop   FROM finance_manager.categories WHERE user_id = v_user_id AND type='expense' AND name='购物';
  SELECT id INTO v_cat_salary FROM finance_manager.categories WHERE user_id = v_user_id AND type='income'  AND name='工资';

  -- 4) 支付账户
  INSERT INTO finance_manager.payment_accounts (user_id, name, kind, icon_emoji, sort_order)
  VALUES (v_user_id, '微信支付', 'wechat', '💬', 1)
  RETURNING id INTO v_acc_wechat;

  INSERT INTO finance_manager.payment_accounts (user_id, name, kind, icon_emoji, card_tail, sort_order)
  VALUES (v_user_id, '招商银行卡', 'bank', '🏦', '8888', 2)
  RETURNING id INTO v_acc_bank;

  -- 5) 示例流水
  INSERT INTO finance_manager.transactions
    (user_id, ledger_id, category_id, account_id, type, amount, occurred_on, title, note) VALUES
    (v_user_id, v_ledger_id, v_cat_salary, v_acc_bank,   'income',  8500.00, CURRENT_DATE - 1, '工资收入', '10 月工资'),
    (v_user_id, v_ledger_id, v_cat_food,   v_acc_wechat, 'expense',   38.00, CURRENT_DATE,     '星巴克',   '拿铁'),
    (v_user_id, v_ledger_id, v_cat_shop,   v_acc_wechat, 'expense',  299.00, CURRENT_DATE,     '优衣库',   '外套'),
    (v_user_id, v_ledger_id, v_cat_food,   v_acc_wechat, 'expense',  142.50, CURRENT_DATE,     '全食超市', '买菜');

  -- 6) 预算：本月总预算 + 餐饮分类预算
  INSERT INTO finance_manager.budgets (user_id, ledger_id, category_id, period_month, amount, is_auto_recur) VALUES
    (v_user_id, v_ledger_id, NULL,       date_trunc('month', CURRENT_DATE)::date, 5000.00, TRUE),
    (v_user_id, v_ledger_id, v_cat_food, date_trunc('month', CURRENT_DATE)::date, 1500.00, TRUE);

  -- 7) 设置 + 连续记账汇总
  INSERT INTO finance_manager.user_settings (user_id, theme, default_ledger_id, default_account_id)
  VALUES (v_user_id, 'light', v_ledger_id, v_acc_wechat);

  INSERT INTO finance_manager.user_streaks (user_id, current_streak, longest_streak, last_checkin_date, total_records)
  VALUES (v_user_id, 2, 2, CURRENT_DATE, 4);

  INSERT INTO finance_manager.checkin_logs (user_id, checkin_date) VALUES
    (v_user_id, CURRENT_DATE - 1),
    (v_user_id, CURRENT_DATE);

  RAISE NOTICE '演示用户 demo（user_id=%）及示例数据已创建。', v_user_id;
END$$;

-- =============================================================================
-- 完成。
-- =============================================================================
