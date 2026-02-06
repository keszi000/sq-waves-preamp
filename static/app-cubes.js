// Cube UI: render, add, edit mode
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
