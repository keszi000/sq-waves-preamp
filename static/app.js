// Init: config load, IP input wiring, initial render
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

render();
