import { pool } from '../db.js';
import { getSave, putSave } from './save.js';
import {
  hasClaimableAttachments,
  normalizeAttachments,
  rowToMailMessage,
} from '../../../shared/mail.js';
import { createDefaultClassProgress, normalizeSave } from '../../../shared/save.js';

function ensureClassProgress(save, classId) {
  if (!save.classProgress[classId]) {
    save.classProgress[classId] = createDefaultClassProgress();
  }
  return save.classProgress[classId];
}

function applyAttachments(save, attachments) {
  const next = normalizeSave(save);
  for (const att of normalizeAttachments(attachments)) {
    if (att.type === 'coins') next.coins += att.amount;
    else if (att.type === 'diamonds') next.diamonds += att.amount;
    else if (att.type === 'item') {
      next.inventory[att.itemId] = (next.inventory[att.itemId] ?? 0) + att.amount;
    } else if (att.type === 'fragments') {
      ensureClassProgress(next, att.classId).fragments += att.amount;
    }
  }
  return next;
}

function summarizeMail(rows) {
  const messages = rows.map(rowToMailMessage);
  const unreadCount = messages.filter((m) => !m.read).length;
  const unclaimedCount = messages.filter(
    (m) => !m.claimed && hasClaimableAttachments(m.attachments),
  ).length;
  return { messages, unreadCount, unclaimedCount };
}

export async function listMail(guestId) {
  const { rows } = await pool.query(
    `SELECT id, title, body, attachments, read_at, claimed_at, created_at
     FROM mail_messages
     WHERE guest_id = $1
     ORDER BY created_at DESC`,
    [guestId],
  );
  return summarizeMail(rows);
}

export async function markMailRead(guestId, mailId) {
  const { rowCount } = await pool.query(
    `UPDATE mail_messages
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND guest_id = $2`,
    [mailId, guestId],
  );
  if (rowCount === 0) return { ok: false, reason: '郵件不存在' };
  return { ok: true, ...(await listMail(guestId)) };
}

export async function claimMail(guestId, mailId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, attachments, claimed_at
       FROM mail_messages
       WHERE id = $1 AND guest_id = $2
       FOR UPDATE`,
      [mailId, guestId],
    );
    const row = rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, reason: '郵件不存在' };
    }
    if (row.claimed_at) {
      await client.query('ROLLBACK');
      return { ok: false, reason: '已領取' };
    }

    const attachments = normalizeAttachments(row.attachments);
    if (attachments.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: '無附件' };
    }

    const save = applyAttachments(await getSave(guestId), attachments);
    await putSave(guestId, save);
    await client.query(
      `UPDATE mail_messages
       SET claimed_at = now(), read_at = COALESCE(read_at, now())
       WHERE id = $1`,
      [mailId],
    );
    await client.query('COMMIT');
    const mail = await listMail(guestId);
    return { ok: true, save, summary: attachments, ...mail };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function claimAllMail(guestId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, attachments
       FROM mail_messages
       WHERE guest_id = $1 AND claimed_at IS NULL AND attachments != '[]'::jsonb
       ORDER BY created_at ASC
       FOR UPDATE`,
      [guestId],
    );

    const claimable = rows.filter((row) => hasClaimableAttachments(row.attachments));
    if (claimable.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: '沒有可領取的附件' };
    }

    let save = await getSave(guestId);
    const summary = [];
    for (const row of claimable) {
      const attachments = normalizeAttachments(row.attachments);
      save = applyAttachments(save, attachments);
      summary.push(...attachments);
      await client.query(
        `UPDATE mail_messages
         SET claimed_at = now(), read_at = COALESCE(read_at, now())
         WHERE id = $1`,
        [row.id],
      );
    }

    await putSave(guestId, save);
    await client.query('COMMIT');
    const mail = await listMail(guestId);
    return { ok: true, save, summary, ...mail };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function sendMail({ guestId, title, body, attachments }) {
  const { rowCount } = await pool.query('SELECT 1 FROM guests WHERE id = $1', [guestId]);
  if (rowCount === 0) return { ok: false, reason: '玩家不存在' };

  const normAttachments = normalizeAttachments(attachments);
  const { rows } = await pool.query(
    `INSERT INTO mail_messages (guest_id, title, body, attachments)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [guestId, title, body ?? '', JSON.stringify(normAttachments)],
  );
  return { ok: true, id: rows[0].id };
}
