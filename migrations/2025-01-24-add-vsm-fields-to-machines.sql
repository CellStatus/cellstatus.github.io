-- Add VSM fields to machines table
ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "batch_size" integer;
ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "uptime_percent" real;
ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "setup_time" real;
ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "cell" text;

-- Add status field to vsm_configurations table
ALTER TABLE "vsm_configurations" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active';
