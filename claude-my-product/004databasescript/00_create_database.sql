-- =============================================================================
-- 00_create_database.sql —— 创建财务管家数据库
-- =============================================================================
-- 说明：
--   CREATE DATABASE 不能在事务/DO 块中条件执行，且需连到 postgres 库执行。
--   以超级用户连接后运行本脚本创建 finance_manager 库；已存在则报错可忽略。
--
-- 命名：
--   数据库名与 schema 名统一为语义化英文 finance_manager（对应产品「财务管家」）；
--   前端历史 localStorage 键沿用 finance_manager_ 前缀，与数据库对象命名相互独立。
--
-- 运行：
--   psql -h 127.0.0.1 -U postgres -d postgres -f 00_create_database.sql
-- =============================================================================

-- 使用 UTF8 编码，确保中文分类名/备注正常存储
CREATE DATABASE finance_manager
  WITH ENCODING 'UTF8'
       LC_COLLATE 'C'
       LC_CTYPE   'C'
       TEMPLATE   template0;

COMMENT ON DATABASE finance_manager IS '财务管家个人记账应用数据库';

-- 建库后请切换到该库执行 01_schema.sql、02_seed.sql：
--   \c finance_manager
--   \i 01_schema.sql
--   \i 02_seed.sql
