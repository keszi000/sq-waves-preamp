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
  const ip = getStoredIP();
  if (ip) headers['X-SQ-IP'] = ip;
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

async function getServerShows() {
  const res = await fetch(API_BASE + '/api/shows');
  if (!res.ok) throw new Error('Could not list shows');
  const data = await res.json();
  return data.shows || [];
}

function confirmModal(message, confirmLabel = 'Continue') {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-modal-message');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = modal.querySelector('.modal-cancel');
    const overlay = modal.querySelector('.modal-overlay');
    msgEl.textContent = message;
    okBtn.textContent = confirmLabel;
    modal.hidden = false;
    const close = (result) => {
      modal.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onEscape);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onEscape = (e) => { if (e.key === 'Escape') close(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onCancel);
    document.addEventListener('keydown', onEscape);
  });
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

function preampOptionLabel(bus, i) {
  if (bus === 'local' && i === 17) return 'Pre 17 (TB)';
  return bus === 'local' ? 'Pre ' + i : 'Pre ' + i;
}

function preampLabel(bus, id) {
  return preampOptionLabel(bus, id);
}

function renderCube(cube) {
  normalizeCubePreamp(cube);
  const div = document.createElement('div');
  div.className = 'cube';
  div.dataset.id = String(cube.id);

  const bus = cube.preampBus;
  const id = cube.preampId;
  const viewLabel = preampLabel(bus, id);

  const busOptions = '<option value="local"' + (bus === 'local' ? ' selected' : '') + '>Local</option><option value="slink"' + (bus === 'slink' ? ' selected' : '') + '>S-Link</option>';
  const idMax = bus === 'slink' ? PREAMP_SLINK_MAX : PREAMP_LOCAL_MAX;
  const idOptions = Array.from({ length: idMax }, (_, i) => i + 1).map(i =>
    `<option value="${i}" ${id === i ? 'selected' : ''}>${preampOptionLabel(bus, i)}</option>`
  ).join('');

  div.innerHTML = `
    <div class="cube-header">
      <input type="text" class="cube-name" value="${escapeAttr(cube.name)}" placeholder="Name" maxlength="32">
      <button type="button" class="cube-remove edit-only" title="Remove">×</button>
    </div>
    <div class="cube-row cube-channel-row">
      <label>Preamp</label>
      <span class="cube-channel-view">${viewLabel}</span>
      <select class="cube-preamp-bus edit-only">${busOptions}</select>
      <select class="cube-channel edit-only">${idOptions}</select>
    </div>
    <div class="cube-row">
      <label>Phantom</label>
      <div class="toggle-wrap" data-toggler="phantom">
        <div class="toggle ${cube.phantom ? 'on' : ''}" role="button" tabindex="0"></div>
        <span>${cube.phantom ? 'On' : 'Off'}</span>
      </div>
    </div>
    <div class="cube-row">
      <label>Pad</label>
      <div class="toggle-wrap" data-toggler="pad">
        <div class="toggle ${cube.pad ? 'on' : ''}" role="button" tabindex="0"></div>
        <span>${cube.pad ? 'On' : 'Off'}</span>
      </div>
    </div>
    <div class="cube-row">
      <label>Gain</label>
      <div class="gain-slider-wrap">
        <input type="range" class="gain-slider" min="0" max="60" step="1" value="${Math.round(cube.gain)}">
        <span class="gain-value">${Math.round(displayGain(cube))} dB</span>
      </div>
    </div>
  `;

  const nameInput = div.querySelector('.cube-name');
  const busSelect = div.querySelector('.cube-preamp-bus');
  const chSelect = div.querySelector('.cube-channel');
  const chView = div.querySelector('.cube-channel-view');
  const phantomWrap = div.querySelector('[data-toggler="phantom"]');
  const padWrap = div.querySelector('[data-toggler="pad"]');
  const phantomToggle = phantomWrap.querySelector('.toggle');
  const padToggle = padWrap.querySelector('.toggle');
  const gainSlider = div.querySelector('.gain-slider');
  const gainValue = div.querySelector('.gain-value');
  const removeBtn = div.querySelector('.cube-remove');

  function updatePreampView() {
    chView.textContent = preampLabel(cube.preampBus, cube.preampId);
  }

  function refreshPreampIdOptions() {
    const usedByOthers = new Set(
      cubes.filter(c => c.id !== cube.id).map(c => `${c.preampBus || 'local'}:${c.preampId ?? c.channel ?? 1}`)
    );
    const bus = cube.preampBus;
    const max = bus === 'slink' ? PREAMP_SLINK_MAX : PREAMP_LOCAL_MAX;
    const available = (i) => `${bus}:${i}` === `${cube.preampBus}:${cube.preampId}` || !usedByOthers.has(`${bus}:${i}`);
    const opts = Array.from({ length: max }, (_, i) => i + 1)
      .filter(available)
      .map(i => `<option value="${i}" ${cube.preampId === i ? 'selected' : ''}>${preampOptionLabel(bus, i)}</option>`)
      .join('');
    chSelect.innerHTML = opts;
  }

  nameInput.addEventListener('input', () => {
    cube.name = nameInput.value.trim() || '';
    saveCubes();
  });

  nameInput.addEventListener('change', () => {
    cube.name = nameInput.value.trim() || '';
    saveCubes();
  });

  busSelect.addEventListener('change', () => {
    cube.preampBus = busSelect.value;
    const max = cube.preampBus === 'slink' ? PREAMP_SLINK_MAX : PREAMP_LOCAL_MAX;
    if (cube.preampId > max) cube.preampId = max;
    refreshPreampIdOptions();
    updatePreampView();
    saveCubes();
  });

  chSelect.addEventListener('mousedown', () => {
    if (!document.body.classList.contains('edit-mode')) return;
    refreshPreampIdOptions();
  });
  chSelect.addEventListener('focus', () => {
    if (!document.body.classList.contains('edit-mode')) return;
    refreshPreampIdOptions();
  });

  chSelect.addEventListener('change', () => {
    cube.preampId = parseInt(chSelect.value, 10);
    updatePreampView();
    saveCubes();
  });

  phantomToggle.addEventListener('click', () => {
    cube.phantom = !cube.phantom;
    phantomToggle.classList.toggle('on', cube.phantom);
    phantomWrap.querySelector('span').textContent = cube.phantom ? 'On' : 'Off';
    saveCubes();
    sendPhantom(cube.preampBus, cube.preampId, cube.phantom).catch(e => toast(e.message, 'error'));
  });

  padToggle.addEventListener('click', () => {
    cube.pad = !cube.pad;
    padToggle.classList.toggle('on', cube.pad);
    padWrap.querySelector('span').textContent = cube.pad ? 'On' : 'Off';
    gainValue.textContent = Math.round(displayGain(cube)) + ' dB';
    saveCubes();
    sendPad(cube.preampBus, cube.preampId, cube.pad).catch(e => toast(e.message, 'error'));
  });

  function setGainValue(v) {
    v = Math.min(60, Math.max(0, Math.round(parseFloat(v) || 0)));
    cube.gain = v;
    gainSlider.value = String(v);
    gainValue.textContent = v + ' dB';
    clearTimeout(gainTimeout);
    gainTimeout = setTimeout(() => {
      saveCubes();
      sendGain(cube.preampBus, cube.preampId, v).catch(e => toast(e.message, 'error'));
    }, 150);
  }

  let gainTimeout;
  gainSlider.addEventListener('input', () => setGainValue(gainSlider.value));

  const gainWrap = div.querySelector('.gain-slider-wrap');
  gainWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = e.deltaY > 0 ? -1 : 1;
    setGainValue(parseInt(gainSlider.value, 10) + step);
  }, { passive: false });

  removeBtn.addEventListener('click', () => {
    cubes = cubes.filter(c => c.id !== cube.id);
    saveCubes();
    div.remove();
  });

  return div;
}

function displayGain(cube) {
  return cube.pad ? cube.gain - 20 : cube.gain;
}

function escapeAttr(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

function render() {
  const container = document.getElementById('cubes');
  container.innerHTML = '';
  cubes.forEach(c => container.appendChild(renderCube(c)));
  document.querySelectorAll('.cube-name').forEach(el => { el.readOnly = !editMode; });
}

function addCube() {
  cubes.push({
    id: nextId(),
    name: '',
    preampBus: 'local',
    preampId: nextPreamp('local'),
    phantom: false,
    pad: false,
    gain: 0,
  });
  saveCubes();
  const container = document.getElementById('cubes');
  container.appendChild(renderCube(cubes[cubes.length - 1]));
}

function setEditMode(on) {
  editMode = on;
  document.body.classList.toggle('edit-mode', on);
  const btn = document.getElementById('edit-toggle');
  if (btn) btn.textContent = on ? 'Done' : 'Edit';
  document.querySelectorAll('.cube-name').forEach(el => { el.readOnly = !on; });
}

document.getElementById('edit-toggle').addEventListener('click', async () => {
  if (editMode) {
    setEditMode(false);
    return;
  }
  const ok = await confirmModal(
    'Edit mode lets you add, remove and rename channels. Unsaved layout changes stay in this browser only. Continue?'
  );
  if (ok) setEditMode(true);
});
document.getElementById('add-cube').addEventListener('click', addCube);

const ipInput = document.getElementById('sq-ip');
async function loadConfig() {
  try {
    const res = await fetch(API_BASE + '/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data.sq_ip) {
        setStoredIP(data.sq_ip);
        if (ipInput) ipInput.value = data.sq_ip;
      }
    }
  } catch (_) {}
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

if (ipInput) {
  ipInput.value = getStoredIP();
  loadConfig().then(() => { ipInput.value = getStoredIP(); });
  ipInput.addEventListener('change', () => {
    setStoredIP(ipInput.value);
    saveConfig(ipInput.value);
  });
  ipInput.addEventListener('blur', () => {
    setStoredIP(ipInput.value);
    saveConfig(ipInput.value);
  });
}

async function syncAllToMixer() {
  let errCount = 0;
  for (const cube of cubes) {
    try {
      await Promise.all([
        sendPhantom(cube.preampBus, cube.preampId, cube.phantom),
        sendPad(cube.preampBus, cube.preampId, cube.pad),
        sendGain(cube.preampBus, cube.preampId, cube.gain),
      ]);
    } catch (e) {
      errCount++;
      toast(e.message, 'error');
    }
    await new Promise(r => setTimeout(r, 40));
  }
  return { errCount };
}

document.getElementById('sync-all').addEventListener('click', async () => {
  if (!getStoredIP()) {
    toast('Enter SQ IP first', 'error');
    return;
  }
  const ok = await confirmModal(
    'Sync all will send the current channel settings (phantom, pad, gain) to the mixer. This will overwrite the mixer state. Continue?'
  );
  if (!ok) return;
  const btn = document.getElementById('sync-all');
  const orig = btn.textContent;
  btn.textContent = 'Sending…';
  btn.disabled = true;
  const { errCount } = await syncAllToMixer();
  btn.textContent = orig;
  btn.disabled = false;
  if (errCount === 0 && cubes.length > 0) toast('Sync done');
});

let _saveModalEscape = null;

function openSaveShowModal() {
  const modal = document.getElementById('save-show-modal');
  const listEl = document.getElementById('save-show-list');
  const newNameInput = document.getElementById('save-show-new-name');
  modal.hidden = false;
  listEl.innerHTML = '';
  newNameInput.value = '';
  _saveModalEscape = (e) => { if (e.key === 'Escape') closeSaveShowModal(); };
  document.addEventListener('keydown', _saveModalEscape);
  getServerShows()
    .then((names) => {
      names.forEach((name) => {
        const item = document.createElement('div');
        item.className = 'server-show-item';
        item.innerHTML = `<span>${escapeHtml(name)}</span><button type="button" class="btn-overwrite" data-name="${escapeAttr(name)}">Overwrite</button>`;
        item.querySelector('.btn-overwrite').addEventListener('click', () => saveOverwrite(name));
        listEl.appendChild(item);
      });
    })
    .catch((e) => toast(e.message, 'error'));
}

function saveOverwrite(name) {
  closeSaveShowModal();
  confirmModal(`Overwrite "${escapeHtml(name)}" with current channels?`, 'Overwrite').then(async (ok) => {
    if (!ok) return;
    await doSaveShow(name);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function doSaveShow(name) {
  const payload = {
    name: name.trim(),
    cubes: cubes.map(c => ({ name: c.name, preampBus: c.preampBus, preampId: c.preampId, phantom: c.phantom, pad: c.pad, gain: c.gain })),
    sq_ip: getStoredIP() || undefined,
  };
  const res = await fetch(API_BASE + '/api/shows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Save failed');
  toast('Show saved to server');
}

document.getElementById('save-show-server').addEventListener('click', () => openSaveShowModal());

document.getElementById('save-show-new-btn').addEventListener('click', async () => {
  const name = document.getElementById('save-show-new-name').value.trim();
  if (!name) {
    toast('Enter a show name', 'error');
    return;
  }
  try {
    await doSaveShow(name);
    closeSaveShowModal();
  } catch (e) {
    toast(e.message || 'Save failed', 'error');
  }
});

function closeSaveShowModal() {
  document.getElementById('save-show-modal').hidden = true;
  if (_saveModalEscape) {
    document.removeEventListener('keydown', _saveModalEscape);
    _saveModalEscape = null;
  }
}
document.getElementById('save-show-close').addEventListener('click', closeSaveShowModal);
document.getElementById('save-show-modal').querySelector('.modal-overlay').addEventListener('click', closeSaveShowModal);

let _loadModalEscape = null;

function openLoadShowModal() {
  const modal = document.getElementById('load-show-modal');
  const listEl = document.getElementById('load-show-list');
  const emptyEl = document.getElementById('load-show-empty');
  modal.hidden = false;
  listEl.innerHTML = '';
  emptyEl.hidden = true;
  _loadModalEscape = (e) => { if (e.key === 'Escape') closeLoadShowModal(); };
  document.addEventListener('keydown', _loadModalEscape);
  getServerShows()
    .then((names) => {
      if (names.length === 0) {
        emptyEl.hidden = false;
        return;
      }
      names.forEach((name) => {
        const item = document.createElement('div');
        item.className = 'server-show-item';
        item.innerHTML = `<span>${escapeHtml(name)}</span><button type="button" class="btn-load" data-name="${escapeAttr(name)}">Load</button>`;
        item.querySelector('.btn-load').addEventListener('click', () => loadShowFromServer(name));
        listEl.appendChild(item);
      });
    })
    .catch((e) => toast(e.message, 'error'));
}

async function loadShowFromServer(name) {
  closeLoadShowModal();
  const ok = await confirmModal(
    `Load "${escapeHtml(name)}"? This will replace your current channels.`,
    'Load'
  );
  if (!ok) {
    openLoadShowModal();
    return;
  }
  try {
    const res = await fetch(API_BASE + '/api/shows/' + encodeURIComponent(name));
    if (!res.ok) throw new Error('Load failed');
    const data = await res.json();
    const list = Array.isArray(data.cubes) ? data.cubes : [];
    const startId = nextId();
    cubes = list.map((c, i) => {
      const bus = c.preampBus === 'slink' ? 'slink' : 'local';
      const rawId = c.preampId ?? c.channel ?? 1;
      const max = bus === 'slink' ? PREAMP_SLINK_MAX : PREAMP_LOCAL_MAX;
      const id = Math.min(max, Math.max(1, parseInt(rawId, 10) || 1));
      return {
        id: startId + i,
        name: c.name ?? '',
        preampBus: bus,
        preampId: id,
        phantom: !!c.phantom,
        pad: !!c.pad,
        gain: Math.min(60, Math.max(0, Math.round(parseFloat(c.gain) || 0))),
      };
    });
    if (data.sq_ip) applyShowIP(data.sq_ip);
    saveCubes();
    render();
    closeLoadShowModal();
    if (getStoredIP()) {
      const { errCount } = await syncAllToMixer();
      if (cubes.length === 0) toast('Show loaded: 0 channel(s)');
      else if (errCount === 0) toast('Show loaded and synced to mixer');
      else toast('Show loaded; some channels failed to sync', 'error');
    } else {
      toast('Show loaded (enter SQ IP to sync to mixer)');
    }
  } catch (e) {
    toast(e.message || 'Load failed', 'error');
  }
}

function closeLoadShowModal() {
  document.getElementById('load-show-modal').hidden = true;
  if (_loadModalEscape) {
    document.removeEventListener('keydown', _loadModalEscape);
    _loadModalEscape = null;
  }
}

document.getElementById('load-show-server').addEventListener('click', () => openLoadShowModal());

document.getElementById('load-show-close').addEventListener('click', closeLoadShowModal);
document.getElementById('load-show-modal').querySelector('.modal-overlay').addEventListener('click', closeLoadShowModal);

let _showManagerEscape = null;

function openShowManagerModal() {
  const modal = document.getElementById('show-manager-modal');
  modal.hidden = false;
  _showManagerEscape = (e) => { if (e.key === 'Escape') closeShowManagerModal(); };
  document.addEventListener('keydown', _showManagerEscape);
}

function closeShowManagerModal() {
  const modal = document.getElementById('show-manager-modal');
  modal.hidden = true;
  if (_showManagerEscape) {
    document.removeEventListener('keydown', _showManagerEscape);
    _showManagerEscape = null;
  }
}

document.getElementById('show-manager-btn').addEventListener('click', openShowManagerModal);
document.getElementById('show-manager-close').addEventListener('click', closeShowManagerModal);
document.getElementById('show-manager-modal').querySelector('.modal-overlay').addEventListener('click', closeShowManagerModal);

document.getElementById('show-manager-export').addEventListener('click', () => {
  const name = prompt('File name (optional):', 'show') || 'show';
  const safe = (name || 'show').replace(/[^a-zA-Z0-9_-]/g, '_');
  const data = {
    version: 1,
    name: safe,
    savedAt: new Date().toISOString(),
    cubes: cubes.map(c => ({ name: c.name, preampBus: c.preampBus, preampId: c.preampId, phantom: c.phantom, pad: c.pad, gain: c.gain })),
    sq_ip: getStoredIP() || undefined,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safe + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported to file');
});

document.getElementById('show-manager-import').addEventListener('click', async () => {
  closeShowManagerModal();
  const ok = await confirmModal(
    'Importing a show will replace your current channels with the file contents. Current layout will be lost unless saved. Continue?',
    'Import'
  );
  if (ok) document.getElementById('import-show').click();
});

document.getElementById('import-show').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const data = JSON.parse(fr.result);
      const list = Array.isArray(data.cubes) ? data.cubes : (Array.isArray(data) ? data : []);
      const startId = nextId();
      cubes = list.map((c, i) => {
        const bus = c.preampBus === 'slink' ? 'slink' : 'local';
        const rawId = c.preampId ?? c.channel ?? 1;
        const max = bus === 'slink' ? PREAMP_SLINK_MAX : PREAMP_LOCAL_MAX;
        const id = Math.min(max, Math.max(1, parseInt(rawId, 10) || 1));
        return {
          id: startId + i,
          name: c.name ?? '',
          preampBus: bus,
          preampId: id,
          phantom: !!c.phantom,
          pad: !!c.pad,
          gain: Math.min(60, Math.max(0, Math.round(parseFloat(c.gain) || 0))),
        };
      });
      if (data.sq_ip) applyShowIP(data.sq_ip);
      saveCubes();
      render();
      toast('Imported: ' + cubes.length + ' channel(s)');
    } catch (err) {
      toast('Invalid show file', 'error');
    }
    e.target.value = '';
  };
  fr.readAsText(file);
});

render();
