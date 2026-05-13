// Eurovision Bingo — vanilla JS, no build step.

const MAX_EASY = 12;
const TOTAL_PICKS = 25;
const GRID_SIZE = 25;

const state = {
  items: [],            // [{ id, text, difficulty, index }]
  byId: new Map(),
  selected: new Set(),  // Set<id>
  cardOrder: [],        // [id, ...] length 25, in render order
};

const els = {
  body: document.body,
  easyList: document.getElementById('easy-list'),
  hardList: document.getElementById('hard-list'),
  totalCount: document.getElementById('total-count'),
  generateBtn: document.getElementById('generate-btn'),
  clearBtn: document.getElementById('clear-btn'),
  reshuffleBtn: document.getElementById('reshuffle-btn'),
  editBtn: document.getElementById('edit-btn'),
  printBtn: document.getElementById('print-btn'),
  shareBtn: document.getElementById('share-btn'),
  shareFeedback: document.getElementById('share-feedback'),
  card: document.getElementById('bingo-card'),
  nameInput: document.getElementById('name-input'),
  cardTitle: document.getElementById('card-title'),
};

// -- PRNG (mulberry32) --------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatText(text) {
  return (text || '').replace(/\s*\(/g, '\n(');
}

function lengthTier(text) {
  const n = (text || '').length;
  if (n <= 15) return 'len-short';
  if (n <= 30) return 'len-medium';
  if (n <= 45) return 'len-long';
  return 'len-xlong';
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// -- Counts -------------------------------------------------------------------
function counts() {
  let easy = 0, hard = 0;
  for (const id of state.selected) {
    const it = state.byId.get(id);
    if (!it) continue;
    if (it.difficulty === 'easy') easy++; else hard++;
  }
  return { easy, hard, total: easy + hard };
}

// -- Selection logic ----------------------------------------------------------
function canSelect(item) {
  const c = counts();
  if (state.selected.has(item.id)) return true;
  if (c.total >= TOTAL_PICKS) return false;
  if (item.difficulty === 'easy' && c.easy >= MAX_EASY) return false;
  return true;
}

function toggle(id) {
  const item = state.byId.get(id);
  if (!item) return;
  if (state.selected.has(id)) {
    state.selected.delete(id);
  } else {
    if (!canSelect(item)) return;
    state.selected.add(id);
  }
  renderPicker();
}

// -- Render: picker -----------------------------------------------------------
function renderPicker() {
  const c = counts();
  els.totalCount.textContent = ` Всего ${c.total}/${TOTAL_PICKS}`;
  const hasName = !!(els.nameInput.value || '').trim();
  els.generateBtn.disabled = c.total !== TOTAL_PICKS || !hasName;
  els.generateBtn.title = !hasName ? 'Введите имя, чтобы сгенерировать карточку' : '';

  const easyFull = c.easy >= MAX_EASY;
  const totalFull = c.total >= TOTAL_PICKS;

  for (const item of state.items) {
    const btn = document.getElementById(`item-${item.id}`);
    if (!btn) continue;
    const isSel = state.selected.has(item.id);
    btn.classList.toggle('selected', isSel);
    btn.setAttribute('aria-pressed', String(isSel));
    let disabled = false;
    if (!isSel) {
      if (totalFull) disabled = true;
      else if (item.difficulty === 'easy' && easyFull) disabled = true;
    }
    btn.disabled = disabled;
  }
}

function buildPicker() {
  els.easyList.innerHTML = '';
  els.hardList.innerHTML = '';
  for (const item of state.items) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `item`;
    btn.id = `item-${item.id}`;
    btn.textContent = item.text;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => toggle(item.id));
    li.appendChild(btn);
    (item.difficulty === 'easy' ? els.easyList : els.hardList).appendChild(li);
  }
}

function renderCardTitle() {
  const name = (els.nameInput.value || '').trim();
  els.cardTitle.textContent = name ? `Бинго: ${name}` : '';
  els.cardTitle.hidden = !name;
}

// -- Card rendering -----------------------------------------------------------
function renderCard() {
  els.card.innerHTML = '';
  for (const id of state.cardOrder) {
    const item = state.byId.get(id);
    if (!item) continue;
    const cell = document.createElement('div');
    cell.className = `cell ${item.difficulty} ${lengthTier(item.text)}`;
    cell.setAttribute('role', 'gridcell');
    cell.textContent = formatText(item.text);
    cell.addEventListener('click', () => cell.classList.toggle('marked'));
    els.card.appendChild(cell);
  }
}

function isAllEasyLine(order) {
  for (let i = 0; i < 5; i++) {
    let rowAllEasy = true, colAllEasy = true;
    for (let j = 0; j < 5; j++) {
      const rowItem = state.byId.get(order[i * 5 + j]);
      const colItem = state.byId.get(order[j * 5 + i]);
      if (!rowItem || rowItem.difficulty !== 'easy') rowAllEasy = false;
      if (!colItem || colItem.difficulty !== 'easy') colAllEasy = false;
    }
    if (rowAllEasy || colAllEasy) return true;
  }
  return false;
}

function generateCard(seed) {
  const ids = Array.from(state.selected);
  if (ids.length !== GRID_SIZE) return false;
  const usedSeed = seed ?? (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);
  const rng = mulberry32(usedSeed);
  let order = shuffle(ids, rng);
  for (let attempt = 0; attempt < 200 && isAllEasyLine(order); attempt++) {
    order = shuffle(ids, rng);
  }
  state.cardOrder = order;
  renderCard();
  renderCardTitle();
  updateHash(ids, usedSeed);
  showCardView();
  return true;
}

function showCardView() {
  els.body.classList.remove('view-picker');
  els.body.classList.add('view-card');
  document.getElementById('picker-view').hidden = true;
  document.getElementById('card-view').hidden = false;
}
function showPickerView() {
  els.body.classList.add('view-picker');
  els.body.classList.remove('view-card');
  document.getElementById('picker-view').hidden = false;
  document.getElementById('card-view').hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
}

// -- URL hash encoding --------------------------------------------------------
// Compact: store the 25 indexes (0..49) packed as bytes, base64-url encoded.
function encodeHash(ids, seed) {
  const indexes = ids
    .map(id => state.byId.get(id)?.index)
    .filter(i => typeof i === 'number');
  const bytes = new Uint8Array(indexes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const name = (els.nameInput.value || '').trim();
  const nameParam = name ? `&n=${encodeURIComponent(name)}` : '';
  return `#c=${b64}&s=${seed.toString(36)}${nameParam}`;
}

function decodeHash(hash) {
  if (!hash || hash.length < 2) return null;
  const params = new URLSearchParams(hash.slice(1));
  const c = params.get('c');
  const s = params.get('s');
  if (!c || !s) return null;
  try {
    const b64 = c.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const indexes = Array.from(bin, ch => ch.charCodeAt(0));
    if (indexes.length !== GRID_SIZE) return null;
    const ids = [];
    for (const idx of indexes) {
      const item = state.items[idx];
      if (!item) return null;
      ids.push(item.id);
    }
    const seed = parseInt(s, 36);
    if (!Number.isFinite(seed)) return null;
    const name = params.get('n') || '';
    return { ids, seed, name };
  } catch {
    return null;
  }
}

function updateHash(ids, seed) {
  const h = encodeHash(ids, seed);
  history.replaceState(null, '', location.pathname + location.search + h);
}

// -- Loading ------------------------------------------------------------------
async function loadItems() {
  const res = await fetch('items.json');
  if (!res.ok) throw new Error(`Failed to load items.json: ${res.status}`);
  const data = await res.json();
  const items = [];
  let i = 0;
  for (const it of data.easy) items.push({ ...it, difficulty: 'easy', index: i++ });
  for (const it of data.hard) items.push({ ...it, difficulty: 'hard', index: i++ });
  state.items = items;
  state.byId = new Map(items.map(it => [it.id, it]));
}

// -- Wiring -------------------------------------------------------------------
function wireEvents() {
  els.generateBtn.addEventListener('click', () => generateCard());
  els.clearBtn.addEventListener('click', () => {
    state.selected.clear();
    renderPicker();
  });
  els.reshuffleBtn.addEventListener('click', () => generateCard());
  els.editBtn.addEventListener('click', () => showPickerView());
  els.printBtn.addEventListener('click', () => window.print());
  els.nameInput.addEventListener('input', () => {
    renderCardTitle();
    renderPicker();
    if (state.cardOrder.length === GRID_SIZE) {
      // refresh hash so name persists in shared URL
      const ids = Array.from(state.selected);
      const params = new URLSearchParams(location.hash.slice(1));
      const seed = parseInt(params.get('s') || '0', 36) || 0;
      updateHash(ids, seed);
    }
  });
  els.shareBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      els.shareFeedback.textContent = 'Link copied!';
    } catch {
      els.shareFeedback.textContent = 'Copy failed — copy URL manually.';
    }
    setTimeout(() => { els.shareFeedback.textContent = ''; }, 2500);
  });
}

async function init() {
  try {
    await loadItems();
  } catch (err) {
    document.body.innerHTML =
      `<pre style="color:#fff;padding:1rem">Failed to load items.json.\n` +
      `Serve this folder over HTTP (e.g. \`python -m http.server\`) instead of opening the file directly.\n\n${err}</pre>`;
    return;
  }
  buildPicker();
  wireEvents();

  const restored = decodeHash(location.hash);
  if (restored) {
    state.selected = new Set(restored.ids);
    if (restored.name) els.nameInput.value = restored.name;
    renderPicker();
    generateCard(restored.seed);
  } else {
    renderPicker();
  }
}

init();
