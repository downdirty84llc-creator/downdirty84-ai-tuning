import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root = fileURLToPath(new URL('../',import.meta.url));
export function buildFixture() {
  const dir = mkdtempSync(join(tmpdir(),'dd84-wire-'));
  const cleanup = () => rmSync(dir,{recursive:true,force:true});
  const run = (command,args) => {
    const result=spawnSync(command,args,{encoding:'utf8',cwd:root,timeout:120000});
    if (result.error || result.status !== 0) throw new Error(`${command}: ${result.error?.message ?? result.stderr ?? result.status}`);
  };
  try {
    const exe=join(dir,process.platform==='win32'?'fixture.exe':'fixture');
    const sources=['src/app.c','src/can_capture.c','src/wire.c','host_wire_fixture.c'];
    run(process.env.CC || 'cc',['-std=c11','-Wall','-Wextra','-Werror',
      ...(process.env.DD84_SANITIZE==='1'?['-fsanitize=address,undefined','-fno-omit-frame-pointer']:[]),
      '-I'+resolve(root,'firmware/include'),...sources.map(p=>resolve(root,'firmware',p)),'-o',exe]);
    const path=join(dir,'synthetic.bin'); run(exe,[path]);
    return {path,cleanup};
  } catch (error) { cleanup(); throw error; }
}
