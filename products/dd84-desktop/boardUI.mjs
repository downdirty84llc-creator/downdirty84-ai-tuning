const section = document.createElement('section');
section.innerHTML = '<h2>DD84 test board</h2><p>USB bench connection · No vehicle access</p><button id="board-refresh">Find board</button> <select id="board-port" aria-label="DD84 serial port"></select> <button id="board-probe" disabled>Test DD84 board</button><p id="board-result" role="status">Connect the FRDM-A-S32K344 by USB.</p>';
document.querySelector('main').prepend(section);
const refresh = section.querySelector('#board-refresh'), probe = section.querySelector('#board-probe');
const ports = section.querySelector('#board-port'), result = section.querySelector('#board-result');
const loop = document.createElement('button'), save = document.createElement('button');
loop.textContent = 'Run internal CAN self-test'; save.textContent = 'Save test report';
loop.disabled = save.disabled = true;
const detail = document.createElement('pre'); detail.setAttribute('aria-live','polite');
section.append(loop,save,detail);
let testedPort = null, report = null;
function clearTest(){testedPort=null;report=null;loop.disabled=save.disabled=true;detail.textContent='';}
ports.onchange=clearTest;
if (!window.dd84Board) {
  refresh.disabled = true;
  result.textContent = 'Device checks are available in the Windows desktop app.';
}
refresh.onclick = async () => {
  clearTest();
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
  clearTest();
  refresh.disabled = probe.disabled = ports.disabled = true;
  result.textContent = 'Checking DD84 handshake…';
  try {
    const identity = await window.dd84Board.probe(ports.value);
    if(identity.capabilities.includes('can-loopback')){testedPort=ports.value;loop.disabled=false;}
    result.textContent = `Handshake passed: ${identity.board} · Firmware ${identity.firmware} · ${identity.protocol}. Bench only; this is a compatibility check, not device authentication.`;
  } catch (e) { result.textContent = e.message; }
  finally { refresh.disabled = ports.disabled = false; probe.disabled = !ports.length; }
};
loop.onclick = async () => {
  if(testedPort!==ports.value)return;
  refresh.disabled=probe.disabled=ports.disabled=loop.disabled=save.disabled=true;
  report=null;detail.textContent='';
  result.textContent='Running eight fixed frames inside the CAN controller. Test data only.';
  try {
    report=await window.dd84Board.loopback(ports.value);
    result.textContent=report.passed ? 'Internal CAN self-test passed — 8/8 frames verified; CAN stopped.' : `Internal CAN self-test failed at ${report.stage}; ${report.received}/8 frames verified. CAN stopped: ${report.canStopped}.`;
    detail.textContent='INTERNAL LOOPBACK TEST DATA — not vehicle data\nDoes not validate CAN wiring or the transceiver.\nTimes are software observation times since test start.\n\nSequence | CAN ID | Time (ms) | Payload\n'+
      report.frames.map(f=>`${f.sequence} | 0x${f.id.toString(16)} | ${(f.timestampTicks/report.tickHz*1000).toFixed(3)} | ${f.data}`).join('\n');
    save.disabled=false;
  }catch(e){result.textContent=e.message;}
  finally{refresh.disabled=probe.disabled=ports.disabled=false;loop.disabled=testedPort!==ports.value;}
};
save.onclick = () => {
  if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify({format:'DD84_LOOPBACK_REPORT_V1',...report},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='DD84-internal-loopback-test.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
};
