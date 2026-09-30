'use strict';

const db = require('./db');

function normalize(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function productIndex() {
  return db.get().products.filter(p => p.active !== false).map(p => ({
    id: p.id,
    name: p.name,
    norm: normalize(p.name),
    words: new Set(normalize(p.name).split(' ')).size,
    price: p.price,
  }));
}

function similarity(a, b) {
  const as = a.split(' ');
  const bs = b.split(' ');
  let hits = 0;
  for (const w of as) if (bs.includes(w)) hits++;
  return hits / Math.max(as.length, bs.length, 1);
}

const STOPWORDS = new Set(['e', 'com', 'de', 'da', 'do', 'para', 'um', 'uma', 'o', 'a', 'os', 'as', 'mais', 'por', 'na', 'no', 'em', 'tambem', 'quero', 'vou']);

function addQty(map, id, qty, mult) {
  map.set(id, Math.max(1, Math.round((map.get(id) || 0) + Math.max(1, qty || 1) * Math.max(1, mult || 1))));
}

function pickBest(products, phrase) {
  const phWords = phrase.replace(/[.,!?;:]/g, ' ').split(' ').filter(w => w && !STOPWORDS.has(w));
  const ph = phWords.join(' ');
  const phCompact = ph.replace(/\s+/g, '');
  let best = null, bestScore = -1;
  for (const p of products) {
    let score = -1;
    if (phCompact && ph.includes(p.norm)) score = 1;
    else if (phCompact && (phCompact === p.compact || phCompact.startsWith(p.compact))) score = 0.9;
    else if (phCompact && p.compact.startsWith(phCompact) && phCompact.length >= 3) score = 0.85;
    else {
      let s = 0;
      const pWords = p.norm.split(' ');
      for (const w of phWords) {
        for (const pw of pWords) {
          if (pw === w) s += 0.5;
          else if (w.length >= 3 && w.length <= pw.length && pw.startsWith(w)) s += 0.4;
          else if (pw.length >= 3 && pw.length < w.length && w.startsWith(pw)) s += 0.3;
        }
      }
      score = Math.min(s, 0.8);
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 0.3 ? best : null;
}

function parseLocal(text) {
  const norm = normalize(text);
  const products = productIndex().map(p => ({ ...p, compact: p.norm.replace(/\s+/g, '') }));
  const matches = new Map();

  let anySeg = false;
  const segRe = /(^|\s)([0-9]{1,3})\s+([a-z][a-z0-9]*(?:\s+[a-z][a-z0-9]*)*)/g;
  let m;
  while ((m = segRe.exec(norm)) !== null) {
    anySeg = true;
    const qty = parseInt(m[2], 10) || 1;
    const hit = pickBest(products, m[3]);
    if (hit) addQty(matches, hit.id, qty, 1);
  }

  if (!anySeg) {
    for (const p of products) {
      if (p.norm && norm.includes(p.norm)) {
        const before = norm.split(p.norm)[0].trim();
        const lastTok = before.split(' ').pop() || '';
        addQty(matches, p.id, /^[0-9]+$/.test(lastTok) ? parseInt(lastTok, 10) : 1, 1);
      } else if (p.compact && norm.includes(p.compact)) {
        addQty(matches, p.id, 1, 1);
      }
    }
  }

  if (!matches.size) {
    const best = products
      .map(p => ({ p, sim: similarity(p.norm, norm) }))
      .filter(x => x.sim > 0.3)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);
    for (const b of best) addQty(matches, b.p.id, 1, 1);
  }

  return [...matches.entries()].map(([id, qty]) => ({ id, qty }));
}

function systemPrompt(products) {
  const menu = products.map(p => ({
    id: p.id, name: p.name, price: p.price, description: p.description || '',
  }));
  return [
    'Você é um assistente de lanchonete. O cliente mandou uma mensagem de pedido em linguagem natural.',
    `Este é o cardápio em JSON: ${JSON.stringify(menu)}`,
    'Responda APENAS com JSON no formato: {"items":[{"id":"<id do produto>","qty":<quantidade>}],"address":"<endereço se houver>","customer":"<nome se houver>","note":"<observações>"}',
    'Use somente IDs que existem no cardápio. Se algum item não existir, ignore. Para quantidade, use o número indicado (ex.: "2 xburgers" => qty 2).',
    'Se já houver itens possíveis mesmo sem match exato, aponte o produto mais parecido.',
  ].join('\n');
}

async function parseOpenAI(products, text) {
  const s = db.get().settings.ai;
  const url = `${(s.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify({
      model: s.model || 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt(products) },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Erro da API (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message.content;
  const m = content.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : content);
}

async function parseOrder(text) {
  const products = db.get().products.filter(p => p.active !== false);
  const s = db.get().settings.ai;

  if (s.apiKey) {
    try {
      const parsed = await parseOpenAI(products, text);
      const items = (parsed.items || [])
        .map(i => {
          const p = products.find(x => x.id === i.id);
          return p ? { id: p.id, qty: Math.max(1, parseInt(i.qty, 10) || 1) } : null;
        })
        .filter(Boolean);
      return {
        items,
        address: parsed.address || '',
        customer: parsed.customer || '',
        note: parsed.note || '',
      };
    } catch (e) {
      console.error('[ai] OpenAI falhou, usando fallback local:', e.message);
    }
  }
  const items = parseLocal(text);
  return { items, address: '', customer: '', note: '', local: true };
}

async function testConnection() {
  const s = db.get().settings.ai;
  if (!s.apiKey) return { ok: false, message: 'Informe a chave da API para testar.' };
  try {
    await parseOpenAI([{ id: 't', name: 'X-Burger', price: 10 }], '1 X-Burger');
    return { ok: true, message: 'Conexão OK' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

module.exports = { parseOrder, parseLocal, testConnection };