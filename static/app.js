// Init: load state from backend, wire IP input, then render
const ipInput = document.getElementById('sq-ip');

if (ipInput) {
  ipInput.addEventListener('change', () => saveConfig(ipInput.value));
  ipInput.addEventListener('blur', () => saveConfig(ipInput.value));
}

loadStateFromServer().then(() => render());
