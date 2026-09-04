import { runMigrations, pool } from './db.js';

await runMigrations();
await pool.end();
console.log('Migrations complete');
