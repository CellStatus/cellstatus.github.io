import { Pool } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set to test the Neon connection.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testConnection() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT COUNT(*) FROM machines;');
    console.log('Machine count:', res.rows[0].count);
    client.release();
  } catch (err) {
    console.error('DB connection/test error:', err);
  }
}

// Run the test
if (require.main === module) {
  testConnection();
}
