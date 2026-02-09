// Shared constants, API and helpers — state lives on backend
const API_BASE = '';

let channels = [];
let editMode = false;

/** Last known config from backend (sq_ip, data_dir). */
let lastConfig = { sq_ip: '', data_dir: 'data' };

async function loadStateFromServer() {
  try {
    const [stateData, configData] = await Promise.all([
      api('/api/state'),
      api('/api/config').catch(() => ({ sq_ip: '', data_dir: 'data' })),
    ]);
    channels = Array.isArray(stateData.channels) ? stateData.channels : [];
    channels.forEach(normalizeChannelPreamp);
    lastConfig.sq_ip = (stateData.sq_ip != null ? String(stateData.sq_ip) : '').trim();
    lastConfig.data_dir = (configData.data_dir != null ? String(configData.data_dir) : 'data').trim() || 'data';
  } catch (_) {
    channels = [];
  }
}

function saveStateToServer(currentShow) {
  const payload = { channels };
  if (currentShow !== undefined && currentShow !== null) payload.current_show = currentShow;
  return fetch(API_BASE + '/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((res) => {
    if (!res.ok) return res.json().then((err) => { throw new Error(err.error || res.statusText); });
    return res.json();
  });
}

function getStoredIP() {
  return lastConfig.sq_ip || '';
}

function setStoredIP(ip) {
  lastConfig.sq_ip = (ip || '').trim();
}

function nextId() {
  const ids = channels.map((c) => c.id).filter(Boolean);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

const PREAMP_LOCAL_MAX = 17;
const PREAMP_SLINK_MAX = 40;

function normalizeChannelPreamp(channel) {
  if (!channel || typeof channel !== 'object') return;
  if (channel.preampBus === undefined || channel.preampId === undefined) {
    const ch = Math.min(17, Math.max(1, parseInt(channel.channel, 10) || 1));
    channel.preampBus = 'local';
    channel.preampId = ch;
  }
  if (channel.preampBus === 'local' && (channel.preampId < 1 || channel.preampId > PREAMP_LOCAL_MAX))
    channel.preampId = Math.max(1, Math.min(PREAMP_LOCAL_MAX, channel.preampId));
  if (channel.preampBus === 'slink' && (channel.preampId < 1 || channel.preampId > PREAMP_SLINK_MAX))
    channel.preampId = Math.max(1, Math.min(PREAMP_SLINK_MAX, channel.preampId));
}

function nextPreamp(bus) {
  const used = new Set(channels.map((c) => `${c.preampBus || 'local'}:${c.preampId ?? c.channel ?? 1}`));
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
  }).then(async (res) => {
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

function displayGain(channel) {
  return channel.pad ? channel.gain - 20 : channel.gain;
}

function saveConfigPayload(payload) {
  const body = { sq_ip: (payload.sq_ip != null ? payload.sq_ip : lastConfig.sq_ip).trim(), data_dir: (payload.data_dir != null ? payload.data_dir : lastConfig.data_dir).trim() || 'data' };
  return fetch(API_BASE + '/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) return res.json().then((err) => { throw new Error(err.error || res.statusText); });
    return res.json();
  }).then((data) => {
    lastConfig.sq_ip = (data.sq_ip != null ? String(data.sq_ip) : '').trim();
    lastConfig.data_dir = (data.data_dir != null ? String(data.data_dir) : 'data').trim() || 'data';
    return data;
  });
}

function applyShowIP(ip) {
  const s = (ip || '').trim();
  if (!s) return;
  lastConfig.sq_ip = s;
  saveConfigPayload({ sq_ip: s, data_dir: lastConfig.data_dir }).catch(() => {});
}
