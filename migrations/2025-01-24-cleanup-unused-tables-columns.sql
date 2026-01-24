-- Migration: Clean up unused tables and columns for VSM-focused app
-- Date: 2025-01-24
-- Description: Removes OEE-related tables, auth tables, and columns, keeping only VSM essentials

-- =====================================================
-- STEP 1: Drop unused columns from machines table
-- =====================================================

ALTER TABLE "machines" DROP COLUMN IF EXISTS "operator_id";
ALTER TABLE "machines" DROP COLUMN IF EXISTS "created_by";
ALTER TABLE "machines" DROP COLUMN IF EXISTS "updated_by";
ALTER TABLE "machines" DROP COLUMN IF EXISTS "good_parts_ran";
ALTER TABLE "machines" DROP COLUMN IF EXISTS "scrap_parts";
ALTER TABLE "machines" DROP COLUMN IF EXISTS "runtime";

-- =====================================================
-- STEP 2: Drop unused columns from vsm_configurations table
-- =====================================================

ALTER TABLE "vsm_configurations" DROP COLUMN IF EXISTS "created_by";
ALTER TABLE "vsm_configurations" DROP COLUMN IF EXISTS "updated_by";

-- =====================================================
-- STEP 3: Drop auth tables (no longer needed)
-- =====================================================

DROP TABLE IF EXISTS "sessions";
DROP TABLE IF EXISTS "users";

-- =====================================================
-- STEP 4: Drop unused tables (order matters for foreign keys)
-- =====================================================

-- Drop event-related tables
DROP TABLE IF EXISTS "event_tasks";
DROP TABLE IF EXISTS "event_members";
DROP TABLE IF EXISTS "events";

-- Drop cell-related tables (replaced by text field on machines)
DROP TABLE IF EXISTS "cell_machines";
DROP TABLE IF EXISTS "cells";

-- Drop OEE/maintenance tracking tables
DROP TABLE IF EXISTS "production_stats";
DROP TABLE IF EXISTS "downtime_logs";
DROP TABLE IF EXISTS "maintenance_logs";

-- Drop operators table
DROP TABLE IF EXISTS "operators";

-- =====================================================
-- VERIFICATION: Check remaining structure
-- =====================================================
-- After running this migration, you should have only:
-- - machines (VSM data)
-- - vsm_configurations (VSM configs)
