'use strict';

// Envia bytes ESC/POS para impressora termica de 58mm.
//   - proto 'tcp'  -> porta 9100 (padrao de fabrica, funciona em qualquer aparelho na rede)
//   - proto 'http' -> algumas impressoras Wi-Fi aceitam o corpo bruto em http://IP/
// O navegador nao abre socket TCP puro: por isso o app usa a ponte WebSocket do servidor.

const net = require('net');
const http = require('http');

const CHUNK = 160;
const GAP = 30;

function writeChunks(socket, buf, gap) {
  return new Promise((resolve, reject) => {
    let off = 0;
    const step = () => {
      if (off >= buf.length) return resolve(true);
      const end = Math.min(off + CHUNK, buf.length);
      const ok = socket.write(buf.subarray(off, end));
      off = end;
      if (ok) setTimeout(step, gap);
      else socket.once('drain', step);
    };
    socket.once('error', reject);
    step();
  });
}

function sendTcp(ip, port, buf, gap) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: ip, port: port || 9100, timeout: 8000 }, () => {
      socket.setTimeout(8000);
      writeChunks(socket, buf, gap == null ? GAP : gap)
        .then(() => { socket.end(); resolve(true); })
        .catch(reject);
    });
    socket.on('timeout', () => { socket.destroy(new Error('Sem resposta da impressora (timeout).')); });
    socket.on('error', reject);
  });
}

function sendHttp(ip, port, buf) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: ip, port: port || 80, path: '/', method: 'POST', timeout: 8000, headers: { 'Content-Type': 'application/octet-stream' } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(true));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Sem resposta da impressora (timeout).')));
    req.on('error', reject);
    req.end(buf);
  });
}

async function sendJob(job) {
  const ip = String(job.ip || '').trim();
  if (!ip) throw new Error('Informe o IP da impressora.');
  const buf = Buffer.from(String(job.data || ''), 'base64');
  if (!buf.length) throw new Error('Conteudo da impressao vazio.');
  const port = parseInt(job.port, 10) || 9100;
  if (job.proto === 'http') await sendHttp(ip, port, buf);
  else await sendTcp(ip, port, buf, job.gap);
  return { ok: true, bytes: buf.length };
}

module.exports = { sendJob, sendTcp, sendHttp };
