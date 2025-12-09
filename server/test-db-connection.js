import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_HkhYmQ3jP2Mu@ep-lively-brook-a8rctex0-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require',
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
