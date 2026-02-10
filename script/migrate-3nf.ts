/**
 * Run the 3NF normalization migration using the existing DB connection.
 * Usage: npx tsx script/migrate-3nf.ts
 */
import { pool } from "../server/db";

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Starting 3NF migration...\n");

    // 1. Check what source table exists
    const tableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('audit_findings', 'spc_data')
    `);
    const tableNames = tableCheck.rows.map((r: any) => r.table_name);
    console.log("Found tables:", tableNames);

    let sourceTable = "";
    if (tableNames.includes("audit_findings")) {
      sourceTable = "audit_findings";
    } else if (tableNames.includes("spc_data")) {
      sourceTable = "spc_data";
    } else {
      console.log("No source table (audit_findings or spc_data) found. Nothing to migrate.");
      return;
    }

    // 2. Count source records
    const countResult = await client.query(`SELECT COUNT(*) as cnt FROM ${sourceTable}`);
    const sourceCount = parseInt(countResult.rows[0].cnt, 10);
    console.log(`Source table "${sourceTable}" has ${sourceCount} records.\n`);

    if (sourceCount === 0) {
      console.log("No data to migrate.");
      return;
    }

    // 3. Check what columns exist on the source table
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = $1
    `, [sourceTable]);
    const cols = colCheck.rows.map((r: any) => r.column_name);
    console.log("Source columns:", cols.join(", "));

    const hasCharNumber = cols.includes("char_number");
    const hasCharacteristic = cols.includes("characteristic");
    const hasCharName = cols.includes("char_name");
    const hasCharMax = cols.includes("char_max");
    const hasCharMin = cols.includes("char_min");
    const hasTolerance = cols.includes("tolerance");
    const hasOpName = cols.includes("op_name");
    const hasPartNumber = cols.includes("part_number");
    const hasPartName = cols.includes("part_name");
    const hasCorrAction = cols.includes("corrective_action");

    // Build the char_number expression from available columns
    const charNumExpr = hasCharNumber && hasCharacteristic
      ? `COALESCE(NULLIF(char_number, ''), NULLIF(characteristic, ''), '(unknown)')`
      : hasCharNumber
        ? `COALESCE(NULLIF(char_number, ''), '(unknown)')`
        : hasCharacteristic
          ? `COALESCE(NULLIF(characteristic, ''), '(unknown)')`
          : `'(unknown)'`;

    const partNumExpr = hasPartNumber
      ? `COALESCE(NULLIF(part_number, ''), '(no-part)')`
      : `'(no-part)'`;

    // 4. Create new tables
    await client.query(`BEGIN`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parts (
        id VARCHAR PRIMARY KEY,
        part_number TEXT NOT NULL,
        part_name TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS characteristics (
        id VARCHAR PRIMARY KEY,
        part_id VARCHAR NOT NULL REFERENCES parts(id),
        char_number TEXT NOT NULL,
        char_name TEXT,
        char_max TEXT,
        char_min TEXT,
        tolerance TEXT,
        op_name TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS spc_measurements (
        id VARCHAR PRIMARY KEY,
        characteristic_id VARCHAR NOT NULL REFERENCES characteristics(id),
        machine_id VARCHAR NOT NULL,
        measured_value TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        record_note TEXT,
        created_at TEXT NOT NULL
      )
    `);
    console.log("\nNormalized tables created.");

    // 5. Insert parts
    const partsSql = `
      INSERT INTO parts (id, part_number, part_name, created_at)
      SELECT
        gen_random_uuid()::text,
        ${partNumExpr},
        ${hasPartName ? `MAX(NULLIF(part_name, ''))` : `NULL`},
        MIN(created_at)
      FROM ${sourceTable}
      GROUP BY ${partNumExpr}
      ON CONFLICT DO NOTHING
    `;
    const partsResult = await client.query(partsSql);
    console.log(`Parts inserted: ${partsResult.rowCount}`);

    // 6. Insert characteristics
    const charsSql = `
      INSERT INTO characteristics (id, part_id, char_number, char_name, char_max, char_min, tolerance, op_name, created_at)
      SELECT
        gen_random_uuid()::text,
        p.id,
        ${charNumExpr},
        ${hasCharName ? `MAX(NULLIF(s.char_name, ''))` : `NULL`},
        ${hasCharMax ? `MAX(NULLIF(s.char_max, ''))` : `NULL`},
        ${hasCharMin ? `MAX(NULLIF(s.char_min, ''))` : `NULL`},
        ${hasTolerance ? `MAX(NULLIF(s.tolerance, ''))` : `NULL`},
        ${hasOpName ? `MAX(NULLIF(s.op_name, ''))` : `NULL`},
        MIN(s.created_at)
      FROM ${sourceTable} s
      JOIN parts p ON p.part_number = ${partNumExpr.replace(/\b(part_number|part_name)\b/g, 's.$1')}
      GROUP BY p.id, ${charNumExpr.replace(/\b(char_number|characteristic)\b/g, 's.$1')}
      ON CONFLICT DO NOTHING
    `;
    const charsResult = await client.query(charsSql);
    console.log(`Characteristics inserted: ${charsResult.rowCount}`);

    // 7. Insert measurements
    const measSql = `
      INSERT INTO spc_measurements (id, characteristic_id, machine_id, measured_value, status, record_note, created_at)
      SELECT
        s.id,
        c.id,
        s.machine_id,
        s.measured_value,
        COALESCE(s.status, 'open'),
        ${hasCorrAction ? `s.corrective_action` : `NULL`},
        s.created_at
      FROM ${sourceTable} s
      JOIN parts p ON p.part_number = ${partNumExpr.replace(/\b(part_number|part_name)\b/g, 's.$1')}
      JOIN characteristics c ON c.part_id = p.id
        AND c.char_number = ${charNumExpr.replace(/\b(char_number|characteristic)\b/g, 's.$1')}
      ON CONFLICT DO NOTHING
    `;
    const measResult = await client.query(measSql);
    console.log(`Measurements inserted: ${measResult.rowCount}`);

    // 8. Verify
    const verifyParts = await client.query(`SELECT COUNT(*) as cnt FROM parts`);
    const verifyChars = await client.query(`SELECT COUNT(*) as cnt FROM characteristics`);
    const verifyMeas = await client.query(`SELECT COUNT(*) as cnt FROM spc_measurements`);
    console.log(`\nVerification:`);
    console.log(`  parts: ${verifyParts.rows[0].cnt}`);
    console.log(`  characteristics: ${verifyChars.rows[0].cnt}`);
    console.log(`  spc_measurements: ${verifyMeas.rows[0].cnt} (expected: ${sourceCount})`);

    const measCount = parseInt(verifyMeas.rows[0].cnt, 10);
    if (measCount === sourceCount) {
      console.log(`\n✓ All ${sourceCount} records migrated successfully!`);
      // Drop old table
      await client.query(`DROP TABLE IF EXISTS ${sourceTable}`);
      console.log(`Dropped old "${sourceTable}" table.`);
    } else {
      console.log(`\n⚠ Only ${measCount} of ${sourceCount} records migrated.`);
      console.log(`Keeping "${sourceTable}" table so you can investigate.`);
      // Show a sample of rows that didn't make it
      const missing = await client.query(`
        SELECT s.id, ${hasPartNumber ? 's.part_number' : `'(none)' as part_number`},
               ${hasCharNumber ? 's.char_number' : `'(none)' as char_number`},
               ${hasCharacteristic ? 's.characteristic' : `'(none)' as characteristic`}
        FROM ${sourceTable} s
        LEFT JOIN spc_measurements m ON m.id = s.id
        WHERE m.id IS NULL
        LIMIT 5
      `);
      console.log("Sample un-migrated rows:", missing.rows);
    }

    // Add indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_characteristics_part_id ON characteristics(part_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_characteristics_part_char ON characteristics(part_id, char_number)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_spc_measurements_char_id ON spc_measurements(characteristic_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_spc_measurements_machine_id ON spc_measurements(machine_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_spc_measurements_created_at ON spc_measurements(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parts_part_number ON parts(part_number)`);
    console.log("Indexes created.");

    await client.query(`COMMIT`);
    console.log("\nMigration complete!");
  } catch (err) {
    await client.query(`ROLLBACK`);
    console.error("Migration failed, rolled back:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
