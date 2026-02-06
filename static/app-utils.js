// Shared constants, state, storage, API and helpers
const STORAGE_KEY = 'sqapi-cubes';
const STORAGE_KEY_IP = 'sqapi-sq-ip';
const API_BASE = '';

let cubes = loadCubes();
let editMode = false;

function loadCubes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.forEach(normalizeCubePreamp);
    return list;
  } catch {
    return [];
  }
}

function saveCubes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cubes));
}

function getStoredIP() {
  return (localStorage.getItem(STORAGE_KEY_IP) || '').trim();
}

function setStoredIP(ip) {
  localStorage.setItem(STORAGE_KEY_IP, (ip || '').trim());
}

function nextId() {
  const ids = cubes.map(c => c.id).filter(Boolean);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

const PREAMP_LOCAL_MAX = 17;
const PREAMP_SLINK_MAX = 40;

function normalizeCubePreamp(cube) {
  if (cube.preampBus === undefined || cube.preampId === undefined) {
    const ch = Math.min(17, Math.max(1, parseInt(cube.channel, 10) || 1));
    cube.preampBus = 'local';
    cube.preampId = ch;
  }
  if (cube.preampBus === 'local' && (cube.preampId < 1 || cube.preampId > PREAMP_LOCAL_MAX))
    cube.preampId = Math.max(1, Math.min(PREAMP_LOCAL_MAX, cube.preampId));
  if (cube.preampBus === 'slink' && (cube.preampId < 1 || cube.preampId > PREAMP_SLINK_MAX))
    cube.preampId = Math.max(1, Math.min(PREAMP_SLINK_MAX, cube.preampId));
}

function nextPreamp(bus) {
  const used = new Set(cubes.map(c => `${c.preampBus || 'local'}:${c.preampId ?? c.channel ?? 1}`));
  const max = bus === 'slink' ? PREAMP_SLINK_MAX : PREAMP_LOCAL_MAX;
  for (let id = 1; id <= max; id++) {
    if (!used.has(`${bus}:${id}`)) return id;
  }
  return 1;
}

function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  return fetch(API_BASE + path, {
    ...options,
    headers,
  }).then(async res => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  });
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = type === 'error' ? 'error-toast' : 'success-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function sendPhantom(bus, id, on) {
  return api(`/preamp/${bus}/${id}/phantom?on=${on}`, { method: 'POST' });
}

function sendPad(bus, id, on) {
  return api(`/preamp/${bus}/${id}/pad?on=${on}`, { method: 'POST' });
}

function sendGain(bus, id, db) {
  return api(`/preamp/${bus}/${id}/gain`, { method: 'POST', body: JSON.stringify({ db }) });
}

function escapeAttr(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function displayGain(cube) {
  return cube.pad ? cube.gain - 20 : cube.gain;
}

function saveConfig(ip) {
  fetch(API_BASE + '/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sq_ip: (ip || '').trim() }),
  }).catch(() => {});
}

function applyShowIP(ip) {
  const s = (ip || '').trim();
  if (!s) return;
  setStoredIP(s);
  saveConfig(s);
  const el = document.getElementById('sq-ip');
  if (el) el.value = s;
}
