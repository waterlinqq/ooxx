import http from 'node:http';
import { WebSocketServer } from 'ws';
import { runMigrations, pool } from './db.js';
import { createGuest, findGuestByToken } from './services/guest.js';
import { getSave, putSave } from './services/save.js';
import {
  listMail,
  markMailRead,
  claimMail,
  claimAllMail,
  sendMail,
} from './services/mail.js';
import { cleanupExpiredMatches, initMatchService } from './services/match.js';
import { MSG } from '../../shared/protocol.js';
import * as room from './ws/messages.js';
import { handleWsMessage, onDisconnect } from './ws/handler.js';

const PORT = Number(process.env.PORT ?? 3001);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function authFromHeader(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  return findGuestByToken(token);
}

async function handleHttp(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mail-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/guest') {
    let body = {};
    try {
      const raw = await readBody(req);
      if (raw) body = JSON.parse(raw);
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }
    const guest = await createGuest(body.nickname ?? null);
    json(res, 201, { token: guest.token, guestId: guest.id });
    return;
  }

  if (url.pathname === '/api/save') {
    const guest = await authFromHeader(req);
    if (!guest) {
      json(res, 401, { error: 'Unauthorized' });
      return;
    }

    if (req.method === 'GET') {
      const save = await getSave(guest.id);
      json(res, 200, save);
      return;
    }

    if (req.method === 'PUT') {
      let body = {};
      try {
        const raw = await readBody(req);
        body = JSON.parse(raw);
      } catch {
        json(res, 400, { error: 'Invalid JSON' });
        return;
      }
      const save = await putSave(guest.id, body);
      json(res, 200, save);
      return;
    }
  }

  if (url.pathname.startsWith('/api/mail')) {
    const guest = await authFromHeader(req);
    if (!guest) {
      json(res, 401, { error: 'Unauthorized' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/mail') {
      const mail = await listMail(guest.id);
      json(res, 200, mail);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/mail/claim-all') {
      const result = await claimAllMail(guest.id);
      json(res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/mail/send') {
      const secret = process.env.MAIL_DEV_SECRET;
      const headerSecret = req.headers['x-mail-secret'];
      if (!secret || headerSecret !== secret) {
        json(res, 403, { error: 'Forbidden' });
        return;
      }
      let body = {};
      try {
        const raw = await readBody(req);
        body = raw ? JSON.parse(raw) : {};
      } catch {
        json(res, 400, { error: 'Invalid JSON' });
        return;
      }
      if (!body.guestId || !body.title) {
        json(res, 400, { error: '缺少 guestId 或 title' });
        return;
      }
      const result = await sendMail({
        guestId: body.guestId,
        title: body.title,
        body: body.body ?? '',
        attachments: body.attachments ?? [],
      });
      json(res, result.ok ? 201 : 400, result);
      return;
    }

    const mailActionMatch = url.pathname.match(/^\/api\/mail\/([^/]+)\/(read|claim)$/);
    if (req.method === 'POST' && mailActionMatch) {
      const mailId = mailActionMatch[1];
      const action = mailActionMatch[2];
      if (action === 'read') {
        const result = await markMailRead(guest.id, mailId);
        json(res, result.ok ? 200 : 400, result);
        return;
      }
      const result = await claimMail(guest.id, mailId);
      json(res, result.ok ? 200 : 400, result);
      return;
    }
  }

  json(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handleHttp(req, res).catch((e) => {
    console.error(e);
    json(res, 500, { error: 'Internal server error' });
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  /** @type {{ id: string, token: string, nickname: string|null } | null} */
  let guest = null;

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      room.send(ws, MSG.ERROR, { code: 'PARSE', message: '無效的 JSON' });
      return;
    }

    if (msg.type === MSG.AUTH) {
      const token = msg.payload?.token;
      if (!token) {
        room.send(ws, MSG.ERROR, { code: 'AUTH', message: '缺少 token' }, msg.reqId);
        return;
      }
      guest = await findGuestByToken(token);
      if (!guest) {
        room.send(ws, MSG.ERROR, { code: 'AUTH', message: '無效的 token' }, msg.reqId);
        return;
      }
      room.registerConnection(guest.id, ws);
      room.send(ws, MSG.AUTH_OK, {
        guestId: guest.id,
        nickname: guest.nickname,
      }, msg.reqId);
      return;
    }

    if (!guest) {
      room.send(ws, MSG.ERROR, { code: 'AUTH', message: '請先 auth' }, msg.reqId);
      return;
    }

    try {
      await handleWsMessage(ws, guest, raw);
    } catch (e) {
      console.error('WS handler error', e);
      room.send(ws, MSG.ERROR, { code: 'SERVER', message: '伺服器錯誤' }, msg.reqId);
    }
  });

  ws.on('close', () => {
    if (guest) {
      onDisconnect(guest.id).catch(console.error);
      room.unregisterConnection(guest.id);
    }
  });
});

await runMigrations();
await initMatchService();

setInterval(() => {
  cleanupExpiredMatches().catch(console.error);
}, 60_000);

server.listen(PORT, () => {
  console.log(`OOXX server listening on http://localhost:${PORT}`);
});
