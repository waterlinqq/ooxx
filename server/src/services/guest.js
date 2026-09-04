import crypto from 'node:crypto';
import { pool } from '../db.js';

export async function createGuest(nickname = null) {
  const token = crypto.randomBytes(32).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO guests (token, nickname) VALUES ($1, $2)
     RETURNING id, token, nickname, created_at`,
    [token, nickname],
  );
  return rows[0];
}

export async function findGuestByToken(token) {
  const { rows } = await pool.query(
    'SELECT id, token, nickname, created_at FROM guests WHERE token = $1',
    [token],
  );
  return rows[0] ?? null;
}

export async function updateGuestNickname(guestId, nickname) {
  await pool.query('UPDATE guests SET nickname = $1 WHERE id = $2', [nickname, guestId]);
}
