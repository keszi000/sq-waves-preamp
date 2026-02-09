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

// Init: load state and config from backend, then render
loadStateFromServer().then(() => render());
