// Config modal
function openConfigModal() {
  api('/api/config')
    .then((c) => {
      document.getElementById('config-sq-ip').value = (c.sq_ip || '').trim();
      document.getElementById('config-data-dir').value = (c.data_dir || 'data').trim() || 'data';
      document.getElementById('config-modal').hidden = false;
    })
    .catch((e) => toast(e.message || 'Could not load config', 'error'));
}

function closeConfigModal() {
  document.getElementById('config-modal').hidden = true;
}

document.getElementById('config-btn').addEventListener('click', openConfigModal);
document.getElementById('config-close').addEventListener('click', closeConfigModal);
document.getElementById('config-modal').querySelector('.modal-overlay').addEventListener('click', closeConfigModal);
document.getElementById('config-save').addEventListener('click', async () => {
  const sqip = document.getElementById('config-sq-ip').value.trim();
  const dataDir = document.getElementById('config-data-dir').value.trim() || 'data';
  try {
    await saveConfigPayload({ sq_ip: sqip, data_dir: dataDir });
    toast('Config saved');
    closeConfigModal();
  } catch (e) {
    toast(e.message || 'Save failed', 'error');
  }
});

document.getElementById('config-reset-state').addEventListener('click', async () => {
  const msg = '<p><strong>Reset state?</strong></p><p>This will:</p><ul><li>Clear <code>state.json</code></li><li>Remove all channels and layout</li><li>Empty the channel list</li></ul><p>This cannot be undone.</p>';
  const ok = await confirmModalHtml(msg, 'Reset state', true);
  if (!ok) return;
  try {
    await fetch(API_BASE + '/api/state/reset', { method: 'POST' });
    await loadStateFromServer();
    render();
    closeConfigModal();
    toast('State reset');
  } catch (e) {
    toast(e.message || 'Reset failed', 'error');
  }
});

document.getElementById('exit-btn').addEventListener('click', async () => {
  if (typeof exitApp !== 'function') return;
  const ok = await confirmModal('Close the app?', 'Close');
  if (ok) exitApp();
});

// Init: load state and config from backend, then render
loadStateFromServer().then(() => render());
