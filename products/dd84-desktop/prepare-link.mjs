// Keep one authoritative codec/comparator in dd84-link. Stage only these two
// browser-compatible files so the portable app has no sibling-directory dependency.
import {mkdir,copyFile} from 'node:fs/promises';
const destination = new URL('./link-shared/',import.meta.url);
await mkdir(destination,{recursive:true});
for (const name of ['wire.mjs','bench-acceptance.mjs']) {
  await copyFile(new URL('../dd84-link/shared/'+name,import.meta.url),new URL(name,destination));
}
