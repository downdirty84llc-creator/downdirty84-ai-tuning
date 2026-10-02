const section = document.createElement('section');
section.innerHTML = '<h2>DD84 test board</h2><p>USB bench connection · No vehicle access</p><button id="board-refresh">Find board</button> <select id="board-port" aria-label="DD84 serial port"></select> <button id="board-probe" disabled>Test DD84 board</button><p id="board-result" role="status">Connect the FRDM-A-S32K344 by USB.</p>';
document.querySelector('main').prepend(section);
const refresh = section.querySelector('#board-refresh'), probe = section.querySelector('#board-probe');
const ports = section.querySelector('#board-port'), result = section.querySelector('#board-result');
if (!window.dd84Board) {
  refresh.disabled = true;
  result.textContent = 'Device checks are available in the Windows desktop app.';
}
refresh.onclick = async () => {
  refresh.disabled = probe.disabled = true;
  ports.replaceChildren();
  try {
    for (const port of await window.dd84Board.list()) {
      const option = document.createElement('option'); option.value = option.textContent = port; ports.append(option);
    }
    result.textContent = ports.length ? 'Select the board port, then test its connection.' : 'No NXP OpenSDA board detected.';
  } catch (e) { result.textContent = e.message; }
  finally { refresh.disabled = false; probe.disabled = !ports.length; }
};
probe.onclick = async () => {
  refresh.disabled = probe.disabled = ports.disabled = true;
  result.textContent = 'Checking DD84 handshake…';
  try {
    const identity = await window.dd84Board.probe(ports.value);
    result.textContent = `Handshake passed: ${identity.board} · Firmware ${identity.firmware} · ${identity.protocol}. Bench only; this is a compatibility check, not device authentication.`;
  } catch (e) { result.textContent = e.message; }
  finally { refresh.disabled = ports.disabled = false; probe.disabled = !ports.length; }
};
