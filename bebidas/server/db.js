'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CATS = [
  { id: 'cervejas', name: 'Cervejas' },
  { id: 'refrigerantes', name: 'Refrigerantes' },
  { id: 'sucos', name: 'Sucos & Naturais' },
  { id: 'aguas', name: 'Águas' },
  { id: 'cafes', name: 'Cafés & Chás' },
  { id: 'energeticos', name: 'Energéticos' },
  { id: 'vinhos', name: 'Vinhos & Espumantes' },
  { id: 'drinks', name: 'Drinks' },
];

const SEED_PRODUCTS = [
  { id: 'cerveja-heineken-lata', name: 'Heineken Lata', size: '350ml', price: 6.5, cat: 'cervejas', aliases: ['heineken', 'heinekem', 'heeniken'], tag: 'gelada' },
  { id: 'cerveja-heineken-longneck', name: 'Heineken Long Neck', size: '330ml', price: 7.5, cat: 'cervejas', aliases: ['heineken long', 'heineken garrafa', 'long neck'], tag: 'gelada' },
  { id: 'cerveja-budweiser', name: 'Budweiser Lata', size: '350ml', price: 5.5, cat: 'cervejas', aliases: ['bud', 'budweiser'], tag: 'gelada' },
  { id: 'cerveja-skol', name: 'Skol Lata', size: '350ml', price: 4.5, cat: 'cervejas', aliases: ['skol'], tag: 'gelada' },
  { id: 'cerveja-brahma', name: 'Brahma Lata', size: '350ml', price: 4.8, cat: 'cervejas', aliases: ['brahma'], tag: 'gelada' },
  { id: 'cerveja-antarctica', name: 'Antarctica Lata', size: '350ml', price: 4.9, cat: 'cervejas', aliases: ['antarctica', 'antarctida'], tag: 'gelada' },
  { id: 'cerveja-corona', name: 'Corona Long Neck', size: '330ml', price: 9.9, cat: 'cervejas', aliases: ['corona'], tag: 'gelada' },
  { id: 'cerveja-stella', name: 'Stella Artois Lata', size: '350ml', price: 7.9, cat: 'cervejas', aliases: ['stella'], tag: 'gelada' },
  { id: 'cerveja-original', name: 'Antarctica Original Lata', size: '350ml', price: 6.9, cat: 'cervejas', aliases: ['original'], tag: 'gelada' },
  { id: 'cerveja-bohemia', name: 'Bohemia Puro Malte', size: '350ml', price: 6.5, cat: 'cervejas', aliases: ['bohemia'], tag: 'gelada' },

  { id: 'refri-coca-lata', name: 'Coca-Cola Lata', size: '350ml', price: 5.0, cat: 'refrigerantes', aliases: ['coca', 'coca cola', 'coca-cola'], tag: 'gelada' },
  { id: 'refri-coca-600', name: 'Coca-Cola Garrafa', size: '600ml', price: 7.0, cat: 'refrigerantes', aliases: ['coca garrafa', 'coca 600', 'coca pet'], tag: 'gelada' },
  { id: 'refri-coca-2l', name: 'Coca-Cola', size: '2L', price: 12.0, cat: 'refrigerantes', aliases: ['coca 2l', 'coca dois litros', 'coca familia'], tag: 'gelada' },
  { id: 'refri-guara-lata', name: 'Guaraná Antarctica Lata', size: '350ml', price: 4.5, cat: 'refrigerantes', aliases: ['guarana', 'guarana antarctica', 'guarana lata'], tag: 'gelada' },
  { id: 'refri-guara-2l', name: 'Guaraná Antarctica', size: '2L', price: 10.9, cat: 'refrigerantes', aliases: ['guarana 2l', 'guarana garrafa'], tag: 'gelada' },
  { id: 'refri-fanta-laranja', name: 'Fanta Laranja Lata', size: '350ml', price: 4.5, cat: 'refrigerantes', aliases: ['fanta', 'fanta laranja'], tag: 'gelada' },
  { id: 'refri-sprite', name: 'Sprite Lata', size: '350ml', price: 4.5, cat: 'refrigerantes', aliases: ['sprite'], tag: 'gelada' },
  { id: 'refri-fanta-uva', name: 'Fanta Uva Lata', size: '350ml', price: 4.5, cat: 'refrigerantes', aliases: ['fanta uva'], tag: 'gelada' },
  { id: 'refri-pepsi', name: 'Pepsi Lata', size: '350ml', price: 4.3, cat: 'refrigerantes', aliases: ['pepsi'], tag: 'gelada' },
  { id: 'refri-soda-limonada', name: 'Soda Limonada Lata', size: '350ml', price: 4.5, cat: 'refrigerantes', aliases: ['soda', 'limonada'], tag: 'gelada' },

  { id: 'suco-laranja', name: 'Suco de Laranja', size: '500ml', price: 8.0, cat: 'sucos', aliases: ['suco laranja', 'laranja'], tag: 'gelado' },
  { id: 'suco-limao', name: 'Suco de Limão', size: '500ml', price: 7.0, cat: 'sucos', aliases: ['suco limao', 'limao'], tag: 'gelado' },
  { id: 'suco-maracuja', name: 'Suco de Maracujá', size: '500ml', price: 8.0, cat: 'sucos', aliases: ['suco maracuja', 'maracuja'], tag: 'gelado' },
  { id: 'suco-abacaxi', name: 'Suco de Abacaxi', size: '500ml', price: 8.0, cat: 'sucos', aliases: ['suco abacaxi', 'abacaxi'], tag: 'gelado' },
  { id: 'suco-uva', name: 'Suco de Uva Integral', size: '1L', price: 12.0, cat: 'sucos', aliases: ['suco uva', 'uva integral'], tag: 'gelado' },
  { id: 'agua-coco', name: 'Água de Coco', size: '300ml', price: 6.0, cat: 'sucos', aliases: ['agua de coco', 'coco'], tag: 'gelado' },
  { id: 'vitamina-banana', name: 'Vitamina de Banana', size: '400ml', price: 9.0, cat: 'sucos', aliases: ['vitamina', 'banana'], tag: 'gelado' },

  { id: 'agua-500', name: 'Água Mineral', size: '500ml', price: 2.5, cat: 'aguas', aliases: ['agua', 'agua mineral', 'agua sem gas'], tag: 'gelada' },
  { id: 'agua-gas-500', name: 'Água Mineral com Gás', size: '500ml', price: 3.5, cat: 'aguas', aliases: ['agua com gas', 'agua gas', 'agua gaseada'], tag: 'gelada' },
  { id: 'agua-1-5', name: 'Água Mineral', size: '1,5L', price: 5.0, cat: 'aguas', aliases: ['agua 1.5', 'agua garrafa'], tag: 'gelada' },

  { id: 'cafe-expresso', name: 'Café Expresso', size: '50ml', price: 4.5, cat: 'cafes', aliases: ['expresso', 'espresso', 'cafe'], tag: 'quente' },
  { id: 'cafe-coado', name: 'Café Coado', size: '200ml', price: 3.5, cat: 'cafes', aliases: ['coado', 'cafe passado'], tag: 'quente' },
  { id: 'cappuccino', name: 'Cappuccino', size: '300ml', price: 8.0, cat: 'cafes', aliases: ['capuccino', 'capuchino'], tag: 'quente' },
  { id: 'cha-limao', name: 'Chá Gelado de Limão', size: '400ml', price: 7.0, cat: 'cafes', aliases: ['chá gelado', 'cha limao', 'ice tea', 'ice tea limao'], tag: 'gelado' },
  { id: 'cha-pessego', name: 'Chá Gelado de Pêssego', size: '400ml', price: 7.0, cat: 'cafes', aliases: ['cha pessego', 'ice tea pessego'], tag: 'gelado' },
  { id: 'cha-camomila', name: 'Chá Quente de Camomila', size: '250ml', price: 6.5, cat: 'cafes', aliases: ['camomila', 'cha quente', 'cha de camomila'], tag: 'quente' },

  { id: 'redbull', name: 'Red Bull', size: '250ml', price: 12.0, cat: 'energeticos', aliases: ['red bull', 'redbul'], tag: 'gelado' },
  { id: 'monster', name: 'Monster', size: '473ml', price: 11.0, cat: 'energeticos', aliases: ['monster'], tag: 'gelado' },
  { id: 'tnt', name: 'TNT Energy', size: '269ml', price: 9.0, cat: 'energeticos', aliases: ['tnt'], tag: 'gelado' },

  { id: 'vinho-taca', name: 'Vinho Tinto Seco Taça', size: '200ml', price: 18.0, cat: 'vinhos', aliases: ['vinho tinto', 'taca de vinho', 'vinho'], tag: 'clima temperado' },
  { id: 'vinho-chile', name: 'Vinho Tinto Reservado', size: '750ml', price: 49.9, cat: 'vinhos', aliases: ['vinho garrafa', 'vinho chileno'], tag: '' },
  { id: 'espumante-brut', name: 'Espumante Brut', size: '750ml', price: 69.9, cat: 'vinhos', aliases: ['espumante', 'brut'], tag: 'gelado' },
  { id: 'espumante-prosecco', name: 'Espumante Prosecco', size: '750ml', price: 79.9, cat: 'vinhos', aliases: ['prosecco'], tag: 'gelado' },

  { id: 'caipirinha-limao', name: 'Caipirinha de Limão', size: '350ml', price: 15.0, cat: 'drinks', aliases: ['caipirinha', 'caipira'], tag: 'gelada' },
  { id: 'caipirinha-morango', name: 'Caipirinha de Morango', size: '350ml', price: 17.0, cat: 'drinks', aliases: ['caipirinha morango', 'caipira morango'], tag: 'gelada' },
  { id: 'gin-tonica', name: 'Gin Tônica', size: '400ml', price: 22.0, cat: 'drinks', aliases: ['gin', 'gin tonica', 'gt'], tag: 'gelado' },
  { id: 'mojito', name: 'Mojito', size: '350ml', price: 20.0, cat: 'drinks', aliases: ['mojito'], tag: 'gelado' },
];

const DEFAULT_DATA = () => ({
  settings: {
    name: 'Bebidas IA',
    tagline: 'Atendente IA de bebidas',
    address: '',
    phone: '',
    deliveryFee: 5,
    orderPrefix: 'bc',
    adminPin: '1234',
    ann: '',
    ai: { baseUrl: '', key: '', model: 'gpt-4o-mini' },
    eta: { preparando: 8, pronto: 4, rota: 12 },
  },
  categories: CATS,
  products: SEED_PRODUCTS,
  orders: [],
  counters: { order: 0 },
});

function dataPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const base = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.platform === 'win32'
      ? process.env.APPDATA
      : path.join(os.homedir(), '.config');
  return path.join(base, 'bebidas-ia', 'data.json');
}

const FILE = dataPath();
let db = null;
let dirty = false;
let timer = null;
const listeners = new Set();

function uid() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function load() {
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!db.settings || !db.products || !db.categories) throw new Error('formato invalido');
  } catch (e) {
    db = DEFAULT_DATA();
  }
  const base = DEFAULT_DATA();
  db.settings = Object.assign({}, base.settings, db.settings || {});
  db.categories = db.categories || base.categories;
  db.products = db.products || [];
  db.orders = db.orders || [];
  db.counters = Object.assign({ order: 0 }, db.counters || {});
  return db;
}

function persistNow() {
  if (!dirty) return;
  dirty = false;
  clearTimeout(timer);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2));
    fs.renameSync(FILE + '.tmp', FILE);
  } catch (e) {
    console.error('[db] erro ao salvar:', e.message);
  }
}

function schedule() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(persistNow, 150);
}

function get() {
  return db;
}

function save(evt, payload) {
  schedule();
  const snapshot = { db, event: evt || 'save', payload };
  for (const fn of listeners) {
    try { fn(snapshot); } catch (e) { /* ignore */ }
  }
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function nextOrderNumber() {
  db.counters.order = (db.counters.order || 0) + 1;
  save('orders:change');
  return db.counters.order;
}

module.exports = { get, load, save, onChange, uid, nextOrderNumber, dataPath };