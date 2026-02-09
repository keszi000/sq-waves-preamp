// Channel UI: render, add, edit mode
function preampOptionLabel(bus, i) {
  if (bus === 'local' && i === 17) return '17 (TB)';
  if (bus === 'local' && LINE_LABELS[i]) return String(i) + ' ' + LINE_LABELS[i];
  return String(i);
}

function preampLabel(bus, id) {
  return preampOptionLabel(bus, id);
}

/** Full label for channel box view: "Local · 1" or "Local · 1 / 2" (stereo) */
function preampViewLabel(bus, id, idR) {
  const busName = bus === 'slink' ? 'S-Link' : 'Local';
  if (idR) return busName + ' · ' + preampLabel(bus, id) + ' / ' + preampLabel(bus, idR);
  return busName + ' · ' + preampLabel(bus, id);
}

function renderChannel(channel) {
  normalizeChannelPreamp(channel);
  const div = document.createElement('div');
  const line = isLineChannel(channel);
  div.className = 'channel' + (line ? ' channel-line' : '');
  div.dataset.id = String(channel.id);

  const bus = channel.preampBus;
  const id = channel.preampId;
  const idR = channel.preampIdR || 0;
  const viewLabel = preampViewLabel(bus, id, idR);

  const busOptions = '<option value="local"' + (bus === 'local' ? ' selected' : '') + '>Local</option><option value="slink"' + (bus === 'slink' ? ' selected' : '') + '>S-Link</option>';
  const idMax = bus === 'slink' ? PREAMP_SLINK_MAX : PREAMP_LOCAL_MAX;
  const idOptions = Array.from({ length: idMax }, (_, i) => i + 1).map(i =>
    `<option value="${i}" ${id === i ? 'selected' : ''}>${preampOptionLabel(bus, i)}</option>`
  ).join('');
  function stereoOptionsHtml() {
    const used = usedPreampSlots();
    const available = (i) => i !== channel.preampId && (i === channel.preampIdR || !used.has(`${channel.preampBus}:${i}`));
    const opts = Array.from({ length: idMax }, (_, i) => i + 1).filter(available)
      .map((i) => `<option value="${i}" ${(channel.preampIdR || 0) === i ? 'selected' : ''}>${preampOptionLabel(bus, i)}</option>`)
      .join('');
    return '<option value="0">— mono</option>' + opts;
  }
  const stereoOptions = stereoOptionsHtml();

  div.innerHTML = `
    <div class="channel-header">
      <input type="text" class="channel-name" value="${escapeAttr(channel.name)}" placeholder="Name" maxlength="32">
      <button type="button" class="channel-remove edit-only" title="Remove">×</button>
    </div>
    <div class="channel-row channel-preamp-row">
      <label>Socket Preamp</label>
      <span class="channel-preamp-view">${viewLabel}</span>
      <select class="channel-preamp-bus edit-only">${busOptions}</select>
      <select class="channel-preamp-id edit-only">${idOptions}</select>
      <span class="channel-preamp-stereo-label edit-only">R</span>
      <select class="channel-preamp-id-r edit-only">${stereoOptions}</select>
    </div>
    <div class="channel-preamp-controls-block">
      <div class="channel-line-hint-row"><p class="channel-line-hint">Line input — no preamp controls</p></div>
      <div class="channel-row channel-controls-row" ${line ? ' data-disabled="true"' : ''}>
        <label>Phantom</label>
        <div class="toggle-wrap" data-toggler="phantom">
          <div class="toggle ${channel.phantom ? 'on' : ''}" role="button" tabindex="0"></div>
          <span>${channel.phantom ? 'On' : 'Off'}</span>
        </div>
      </div>
      <div class="channel-row channel-controls-row" ${line ? ' data-disabled="true"' : ''}>
        <label>Pad</label>
        <div class="toggle-wrap" data-toggler="pad">
          <div class="toggle ${channel.pad ? 'on' : ''}" role="button" tabindex="0"></div>
          <span>${channel.pad ? 'On' : 'Off'}</span>
        </div>
      </div>
      <div class="channel-row channel-controls-row" ${line ? ' data-disabled="true"' : ''}>
        <label>Gain</label>
        <div class="gain-slider-wrap">
          <input type="range" class="gain-slider" min="0" max="60" step="1" value="${Math.round(channel.gain)}" ${line ? ' disabled' : ''}>
          <span class="gain-value">${Math.round(displayGain(channel))} dB</span>
        </div>
      </div>
    </div>
  `;

  const nameInput = div.querySelector('.channel-name');
  const busSelect = div.querySelector('.channel-preamp-bus');
  const chSelect = div.querySelector('.channel-preamp-id');
  const chSelectR = div.querySelector('.channel-preamp-id-r');
  const chView = div.querySelector('.channel-preamp-view');
  const phantomWrap = div.querySelector('[data-toggler="phantom"]');
  const padWrap = div.querySelector('[data-toggler="pad"]');
  const phantomToggle = phantomWrap.querySelector('.toggle');
  const padToggle = padWrap.querySelector('.toggle');
  const gainSlider = div.querySelector('.gain-slider');
  const gainValue = div.querySelector('.gain-value');
  const removeBtn = div.querySelector('.channel-remove');

  function updatePreampView() {
    chView.textContent = preampViewLabel(channel.preampBus, channel.preampId, channel.preampIdR || 0);
  }

  function updateLineState() {
    const line = isLineChannel(channel);
    div.classList.toggle('channel-line', line);
    const block = div.querySelector('.channel-preamp-controls-block');
    if (block) block.dataset.disabled = line ? 'true' : '';
    div.querySelectorAll('.channel-controls-row').forEach(r => { r.dataset.disabled = line ? 'true' : ''; });
    gainSlider.disabled = line;
  }

  function refreshPreampIdOptions() {
    const used = usedPreampSlots();
    const bus = channel.preampBus;
    const max = bus === 'slink' ? PREAMP_SLINK_MAX : PREAMP_LOCAL_MAX;
    const available = (i) => i === channel.preampId || i === channel.preampIdR || !used.has(`${bus}:${i}`);
    const opts = Array.from({ length: max }, (_, i) => i + 1)
      .filter(available)
      .map(i => `<option value="${i}" ${channel.preampId === i ? 'selected' : ''}>${preampOptionLabel(bus, i)}</option>`)
      .join('');
    chSelect.innerHTML = opts;
    if (chSelectR) {
      chSelectR.innerHTML = stereoOptionsHtml();
      if (channel.preampIdR) chSelectR.value = String(channel.preampIdR);
    }
  }

  nameInput.addEventListener('input', () => {
    channel.name = nameInput.value.trim() || '';
    saveStateToServer().catch(() => {});
  });

  nameInput.addEventListener('change', () => {
    channel.name = nameInput.value.trim() || '';
    saveStateToServer().catch(() => {});
  });

  busSelect.addEventListener('change', () => {
    channel.preampBus = busSelect.value;
    const max = channel.preampBus === 'slink' ? PREAMP_SLINK_MAX : PREAMP_LOCAL_MAX;
    if (channel.preampId > max) channel.preampId = max;
    if (channel.preampIdR > max) channel.preampIdR = 0;
    refreshPreampIdOptions();
    updatePreampView();
    updateLineState();
    saveStateToServer().catch(() => {});
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
    channel.preampId = parseInt(chSelect.value, 10);
    if (channel.preampIdR === channel.preampId) channel.preampIdR = 0;
    refreshPreampIdOptions();
    updatePreampView();
    updateLineState();
    saveStateToServer().catch(() => {});
  });

  if (chSelectR) {
    chSelectR.addEventListener('change', () => {
      channel.preampIdR = parseInt(chSelectR.value, 10) || 0;
      updatePreampView();
      updateLineState();
      saveStateToServer().catch(() => {});
    });
    chSelectR.addEventListener('focus', () => { if (document.body.classList.contains('edit-mode')) refreshPreampIdOptions(); });
  }

  phantomToggle.addEventListener('click', () => {
    if (isLineChannel(channel)) return;
    channel.phantom = !channel.phantom;
    phantomToggle.classList.toggle('on', channel.phantom);
    phantomWrap.querySelector('span').textContent = channel.phantom ? 'On' : 'Off';
    saveStateToServer().catch(() => {});
    sendPhantom(channel.preampBus, channel.preampId, channel.phantom).catch(e => toast(e.message, 'error'));
    if (channel.preampIdR) sendPhantom(channel.preampBus, channel.preampIdR, channel.phantom).catch(e => toast(e.message, 'error'));
  });

  padToggle.addEventListener('click', () => {
    if (isLineChannel(channel)) return;
    channel.pad = !channel.pad;
    padToggle.classList.toggle('on', channel.pad);
    padWrap.querySelector('span').textContent = channel.pad ? 'On' : 'Off';
    gainValue.textContent = Math.round(displayGain(channel)) + ' dB';
    saveStateToServer().catch(() => {});
    sendPad(channel.preampBus, channel.preampId, channel.pad).catch(e => toast(e.message, 'error'));
    if (channel.preampIdR) sendPad(channel.preampBus, channel.preampIdR, channel.pad).catch(e => toast(e.message, 'error'));
  });

  function setGainValue(v) {
    if (isLineChannel(channel)) return;
    v = Math.min(60, Math.max(0, Math.round(parseFloat(v) || 0)));
    channel.gain = v;
    gainSlider.value = String(v);
    gainValue.textContent = Math.round(displayGain(channel)) + ' dB';
    clearTimeout(gainTimeout);
    gainTimeout = setTimeout(() => {
      saveStateToServer().catch(() => {});
      sendGain(channel.preampBus, channel.preampId, v).catch(e => toast(e.message, 'error'));
      if (channel.preampIdR) sendGain(channel.preampBus, channel.preampIdR, v).catch(e => toast(e.message, 'error'));
    }, 150);
  }

  let gainTimeout;
  gainSlider.addEventListener('input', () => setGainValue(gainSlider.value));

  const gainWrap = div.querySelector('.gain-slider-wrap');
  gainWrap.addEventListener('wheel', (e) => {
    if (isLineChannel(channel)) return;
    e.preventDefault();
    const step = e.deltaY > 0 ? -1 : 1;
    setGainValue(parseInt(gainSlider.value, 10) + step);
  }, { passive: false });

  removeBtn.addEventListener('click', () => {
    channels = channels.filter(c => c.id !== channel.id);
    saveStateToServer().catch(() => {});
    div.remove();
  });

  return div;
}

function render() {
  const container = document.getElementById('channels');
  container.innerHTML = '';
  channels.forEach(c => container.appendChild(renderChannel(c)));
  document.querySelectorAll('.channel-name').forEach(el => { el.readOnly = !editMode; });
}

function addChannel() {
  channels.push({
    id: nextId(),
    name: '',
    preampBus: 'local',
    preampId: nextPreamp('local'),
    preampIdR: 0,
    phantom: false,
    pad: false,
    gain: 0,
  });
  saveStateToServer().catch(() => {});
  const container = document.getElementById('channels');
  container.appendChild(renderChannel(channels[channels.length - 1]));
}

function setEditMode(on) {
  editMode = on;
  document.body.classList.toggle('edit-mode', on);
  const btn = document.getElementById('edit-toggle');
  if (btn) btn.textContent = on ? 'Done' : 'Edit';
  document.querySelectorAll('.channel-name').forEach(el => { el.readOnly = !on; });
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
document.getElementById('add-channel').addEventListener('click', addChannel);
