// Show save/load modals, sync all, show manager (export/import)
async function syncAllToMixer() {
  const data = await api('/api/sync', { method: 'POST' });
  return { errCount: 0, synced: data.synced ?? 0 };
}

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

async function doSaveShow(name) {
  const payload = {
    name: name.trim(),
    channels: channels.map(c => ({ name: c.name, preampBus: c.preampBus, preampId: c.preampId, phantom: c.phantom, pad: c.pad, gain: c.gain })),
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

function closeSaveShowModal() {
  document.getElementById('save-show-modal').hidden = true;
  if (_saveModalEscape) {
    document.removeEventListener('keydown', _saveModalEscape);
    _saveModalEscape = null;
  }
}

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
    const list = Array.isArray(data.channels) ? data.channels : (Array.isArray(data.cubes) ? data.cubes : []);
    const startId = nextId();
    channels = list.map((c, i) => {
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
    await saveStateToServer().catch(() => {});
    render();
    closeLoadShowModal();
    if (getStoredIP()) {
      try {
        const { errCount } = await syncAllToMixer();
        if (channels.length === 0) toast('Show loaded: 0 channel(s)');
        else if (errCount === 0) toast('Show loaded and synced to mixer');
        else toast('Show loaded; some channels failed to sync', 'error');
      } catch (syncErr) {
        toast(syncErr.message || 'Sync failed', 'error');
      }
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

document.getElementById('sync-all').addEventListener('click', async () => {
  const ok = await confirmModal(
    'Sync all will send the current channel settings (phantom, pad, gain) to the mixer. This will overwrite the mixer state. Continue?'
  );
  if (!ok) return;
  const btn = document.getElementById('sync-all');
  const orig = btn.textContent;
  btn.textContent = 'Sending…';
  btn.disabled = true;
  try {
    const { errCount, synced } = await syncAllToMixer();
    if (errCount === 0 && (synced > 0 || channels.length === 0)) toast('Sync done');
  } catch (e) {
    toast(e.message || 'Sync failed', 'error');
  }
  btn.textContent = orig;
  btn.disabled = false;
});

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

document.getElementById('save-show-close').addEventListener('click', closeSaveShowModal);
document.getElementById('save-show-modal').querySelector('.modal-overlay').addEventListener('click', closeSaveShowModal);

document.getElementById('load-show-server').addEventListener('click', () => openLoadShowModal());
document.getElementById('load-show-close').addEventListener('click', closeLoadShowModal);
document.getElementById('load-show-modal').querySelector('.modal-overlay').addEventListener('click', closeLoadShowModal);

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
    channels: channels.map(c => ({ name: c.name, preampBus: c.preampBus, preampId: c.preampId, phantom: c.phantom, pad: c.pad, gain: c.gain })),
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
      const list = Array.isArray(data.channels) ? data.channels : (Array.isArray(data.cubes) ? data.cubes : (Array.isArray(data) ? data : []));
      const startId = nextId();
      channels = list.map((c, i) => {
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
      saveStateToServer().catch(() => {});
      render();
      toast('Imported: ' + channels.length + ' channel(s)');
    } catch (err) {
      toast('Invalid show file', 'error');
    }
    e.target.value = '';
  };
  fr.readAsText(file);
});
