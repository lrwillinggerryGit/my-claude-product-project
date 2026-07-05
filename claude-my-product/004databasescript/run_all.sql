-- =============================================================================
-- run_all.sql —— 一键初始化（在 finance_manager 库内按序执行）
-- =============================================================================
-- 前置：已通过 00_create_database.sql 创建 finance_manager 库。
-- 运行：
--   psql -h 127.0.0.1 -U postgres -d finance_manager -f run_all.sql
-- =============================================================================
\echo '>>> 1/4 建表（01_schema.sql）'
\i 01_schema.sql
\echo '>>> 2/4 预置数据（02_seed.sql）'
\i 02_seed.sql
\echo '>>> 3/4 视图（04_views.sql）'
\i 04_views.sql
\echo '>>> 4/4 演示数据（03_sample_data.sql，可选）'
\i 03_sample_data.sql
\echo '>>> 完成。'
