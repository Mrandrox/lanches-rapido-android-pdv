'use strict';

// Ponte WebSocket minima (sem dependencias): o navegador manda os bytes ESC/POS
// em JSON e o servidor escreve direto na impressora da rede.

const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(String(key) + GUID).digest('base64');
}

function encodeFrame(data, opcode) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  let head;
  if (payload.length < 126) {
    head = Buffer.from([0x80 | (opcode || 0x1), payload.length]);
  } else if (payload.length < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | (opcode || 0x1);
    head[1] = 126;
    head.writeUInt16BE(payload.length, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | (opcode || 0x1);
    head[1] = 127;
    head.writeUInt32BE(Math.floor(payload.length / 2 ** 32), 2);
    head.writeUInt32BE(payload.length >>> 0, 6);
  }
  return Buffer.concat([head, payload]);
}

function closeFrame(code, reason) {
  const body = Buffer.alloc(2 + Buffer.byteLength(reason || ''));
  body.writeUInt16BE(code || 1000, 0);
  if (reason) body.write(reason, 2);
  return encodeFrame(body, 0x8);
}

function decoder(onMessage, onClose) {
  let buf = Buffer.alloc(0);
  let parts = [];
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = buf.readUInt32BE(2) * 2 ** 32 + buf.readUInt32BE(6);
        off = 10;
      }
      let mask = null;
      if (masked) {
        if (buf.length < off + 4) return;
        mask = buf.subarray(off, off + 4);
        off += 4;
      }
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len));
      buf = buf.subarray(off + len);
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      if (opcode === 0x8) { onClose(); return; }
      if (opcode === 0x9) continue;
      if (opcode === 0x0) parts.push(payload);
      else parts = [payload];
      if (fin) {
        const full = Buffer.concat(parts);
        parts = [];
        onMessage(full);
      }
    }
  };
}

function handshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (req.headers.upgrade && String(req.headers.upgrade).toLowerCase() === 'websocket' && key) {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n'
      + 'Upgrade: websocket\r\n'
      + 'Connection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
    );
    return true;
  }
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  return false;
}

function refuse(socket, code, text) {
  socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
}

function attach(server, { path: wsPath, authorize, onJob }) {
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    const url = new URL(req.url, 'http://local');
    if (url.pathname !== wsPath) return refuse(socket, 404, 'Not Found');
    if (!authorize(req, url)) return refuse(socket, 401, 'Unauthorized');
    if (!handshake(req, socket)) return;
    let alive = true;
    const send = (obj) => { if (alive) socket.write(encodeFrame(JSON.stringify(obj), 0x1)); };
    const close = () => { if (!alive) return; alive = false; try { socket.write(closeFrame(1000)); } catch (e) { /* ignore */ } socket.destroy(); };
    socket.on('close', () => { alive = false; });
    socket.on('error', close);
    if (head && head.length) socket.unshift(head);
    const feed = decoder(async (payload) => {
      let job;
      try { job = JSON.parse(payload.toString('utf8')); }
      catch (e) { return send({ id: null, ok: false, error: 'Pacote invalido' }); }
      const id = job.id || null;
      try {
        const res = await onJob(job);
        send(Object.assign({ id, ok: true }, res || {}));
      } catch (e) {
        send({ id, ok: false, error: e.message || 'Falha na impressao' });
      }
    }, close);
    socket.on('data', (chunk) => { try { feed(chunk); } catch (e) { send({ id: null, ok: false, error: e.message }); } });
    send({ ok: true, ready: true });
  });
}

module.exports = { attach, encodeFrame, acceptKey };
