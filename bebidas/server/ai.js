'use strict';

const db = require('./db');

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMBER_WORDS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  duzia: 12, vinte: 20, trinta: 30,
};

const STOP = new Set(['e', 'com', 'de', 'da', 'do', 'para', 'o', 'a', 'os', 'as', 'mais', 'por', 'na', 'no', 'em', 'tambem', 'quero', 'vou', 'pra', 'me', 'queria', 'gostaria', 'por favor', 'pfv', 'pf', 'aquela', 'aquele', 'ice', 'ta', 'estou', 'eu']);

function catalogue() {
  return db.get().products.map(p => ({
    id: p.id,
    name: p.name,
    size: p.size,
    price: p.price,
    cat: p.cat,
    aliases: p.aliases || [],
    search: normalize(`${p.name} ${p.size} ${(p.aliases || []).join(' ')}`),
  }));
}

function scorePhrase(phrase, product) {
  const words = normalize(phrase).split(' ').filter(w => w && !STOP.has(w) && !NUMBER_WORDS[w]);
  if (!words.length) return 0;
  const haystack = product.search.split(' ');
  let hits = 0;
  let total = 0;
  for (const w of words) {
    if (w.length < 2) continue;
    total++;
    let best = 0;
    for (const h of haystack) {
      if (h === w) best = Math.max(best, 1);
      else if (w.length >= 3 && h.startsWith(w)) best = Math.max(best, 0.85);
      else if (w.length >= 3 && w.startsWith(h) && h.length >= 3) best = Math.max(best, 0.8);
    }
    hits += best;
  }
  const lengthBonus = Math.min(product.search.split(' ').length, 4) * 0.02;
  return total ? hits / total + lengthBonus : 0;
}

function matchProducts(phrase) {
  const cat = db.get().categories.find(c => normalize(c.name).split(' ').length <= 2 && phrase.includes(normalize(c.name)));
  let pool = catalogue();
  if (cat) pool = pool.filter(p => p.cat === cat.id);
  const scored = pool
    .map(p => ({ p, score: scorePhrase(phrase, p) }))
    .filter(x => x.score >= 0.45)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  const top = scored[0].score;
  const phraseWords = normalize(phrase).split(' ').filter(w => w && !STOP.has(w) && !NUMBER_WORDS[w]);
  const ties = scored
    .filter(x => x.score >= top - 0.01)
    .map(x => {
      const name = normalize(x.p.name);
      const cov = phraseWords.filter(w => name.includes(w)).length;
      return { p: x.p, cov };
    })
    .sort((a, b) => (b.cov - a.cov) || (a.p.price - b.p.price))
    .map(x => x.p);
  return ties;
}

function segmentsOf(text) {
  const toks = normalize(text).split(' ').filter(Boolean);
  const out = [];
  let cur = null;
  const finish = () => { if (cur && cur.words.length) out.push(cur); };
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (/^[0-9]{1,3}$/.test(t)) {
      finish();
      cur = { qty: Math.max(1, parseInt(t, 10)), words: [] };
      i++;
      continue;
    }
    if (t === 'meia' && toks[i + 1] === 'duzia') {
      finish();
      cur = { qty: 6, words: [] };
      i += 2;
      continue;
    }
    if (NUMBER_WORDS[t]) {
      finish();
      cur = { qty: NUMBER_WORDS[t], words: [] };
      i++;
      continue;
    }
    if (!cur) cur = { qty: 1, words: [] };
    if (!STOP.has(t)) cur.words.push(t);
    i++;
  }
  finish();
  return out;
}

function parseLocal(text) {
  const results = [];
  for (const seg of segmentsOf(text)) {
    const phrase = seg.words.join(' ');
    const goods = matchProducts(phrase);
    if (goods.length) {
      results.push({ id: goods[0].id, qty: seg.qty });
    }
  }
  return { items: results, matched: results.length > 0 };
}

function describe(dbItem) {
  return `${dbItem.name} ${dbItem.size}`;
}

const UPSELLS = {
  cervejas: 'Aproveitando a cerveja, hoje o combo é 4 latas por R$ 24,90. Quer que eu adicione?',
  energeticos: 'Para fechar com energia, temos Red Bull por R$ 12 e Monster por R$ 11. Adiciono?',
  sucos: 'Se quiser algo natural, o suco de laranja 500ml sai por R$ 8. Posso colocar?',
  vinhos: 'Para o vinho, sugiro gelar uns 30 minutos antes de abrir. Aceita uma taça extra?',
  drinks: 'Nossos drinks são preparados na hora. Posso adicionar uma caipirinha aos pedidos?',
};

const GREETINGS = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ola', 'hey', 'eai', 'e ai', 'viva'];

function localReply(text, items) {
  const norm = normalize(text);
  const greeted = GREETINGS.some(g => norm === g || norm.startsWith(g + ' '));
  if (greeted && !items.length) {
    return 'Olá! Eu sou o atendente de bebidas aqui da casa. É só falar o que você quer, por exemplo: "2 Heineken gelada e 1 suco de laranja". Posso anotar seu pedido?';
  }
  if (!items.length) {
    if (norm.includes('preco') || norm.includes('quanto') || norm.includes('valor') || norm.includes('custa')) {
      return 'Posso confirmar preços de qualquer item do cardápio. Me diga qual bebida você quer saber o valor (ex.: "quanto custa a Heineken?") e eu respondo na hora.';
    }
    return 'Não consegui identificar as bebidas. Tente algo como "3 Coca gelada", "1 heineken long neck" ou "meia dúzia de Skol". Ainda não encontrei o que você pediu.';
  }
  const names = items.map(i => {
    const p = db.get().products.find(x => x.id === i.id);
    return `${i.qty} ` + (p ? describe(p) : i.id);
  }).join(', ');
  let reply = `Anotei o pedido: ${names}. Quer que eu adicione ${items.length > 1 ? 'esses itens' : 'esse item'} ao carrinho?`;
  for (const i of items) {
    const p = db.get().products.find(x => x.id === i.id);
    if (UPSELLS[p.cat]) {
      reply += ' ' + UPSELLS[p.cat];
      break;
    }
  }
  return reply;
}

function systemPrompt(productsJson) {
  return [
    'Você é o atendente IA de vendas de um estabelecimento especializado em bebidas.',
    'Seu tom é amigável, vendedor e direto, sempre em português do Brasil.',
    `Cardápio em JSON: ${productsJson}`,
    'Regras:',
    '- Interprete a mensagem do cliente em linguagem natural e identifique as bebidas pedidas com quantidade.',
    '- Responda apenas com JSON: {"reply":"sua resposta ao cliente","items":[{"id":"<id>","qty":<quantidade>}]}.',
    '- reply é uma mensagem curta de atendimento (confirmação, preço, sugestão).',
    '- Use somente IDs presentes no cardápio. Não invente bebidas.',
    '- Se o cliente só perguntar algo, items pode ficar vazio.',
    '- Ofereça sugestões de venda (combo, outra bebida da mesma categoria).',
  ].join('\n');
}

async function parseOpenAI(text) {
  const s = db.get().settings.ai;
  const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const products = db.get().products.map(p => ({ id: p.id, name: p.name, size: p.size, price: p.price, cat: p.cat }));
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.key}`,
    },
    body: JSON.stringify({
      model: s.model || 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt(JSON.stringify(products)) },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message.content;
  const m = content.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : content);
}

const PRICE_QUESTION = ['quanto custa', 'qual o preco', 'qual e o preco', 'quanto e', 'quanto fica', 'preco de', 'valor do', 'valor da', 'custa'];

function isPriceQuestion(text) {
  const norm = normalize(text);
  return PRICE_QUESTION.some(q => norm.includes(q));
}

function priceReply(text, local) {
  if (!local.items.length) return 'Posso confirmar preços de qualquer item do cardápio. Me diga qual bebida você quer saber o valor.';
  const p = db.get().products.find(x => x.id === local.items[0].id);
  if (!p) return 'Não encontrei esse item no cardápio.';
  return `${p.name} (${p.size}) custa R$ ${p.price.toFixed(2).replace('.', ',')}. Quer que eu anote no seu pedido?`;
}

async function parseMessage(text) {
  const s = db.get().settings.ai;
  let openai = null;
  if (s.key) {
    try {
      openai = await parseOpenAI(text);
    } catch (e) {
      console.error('[ai] OpenAI falhou, usando local:', e.message);
    }
  }
  if (openai) {
    const items = (openai.items || [])
      .map(i => {
        const p = db.get().products.find(x => x.id === i.id);
        return p ? { id: p.id, qty: Math.max(1, parseInt(i.qty, 10) || 1) } : null;
      })
      .filter(Boolean);
    return { reply: openai.reply || 'Anotei o pedido!', items };
  }
  const local = parseLocal(text);
  const items = local.items
    .map(i => ({ id: i.id, qty: i.qty }))
    .filter(i => db.get().products.some(p => p.id === i.id));
  if (isPriceQuestion(text)) {
    return { reply: priceReply(text, local), items: [] };
  }
  return { reply: localReply(text, items), items };
}

module.exports = { parseMessage, parseLocal };