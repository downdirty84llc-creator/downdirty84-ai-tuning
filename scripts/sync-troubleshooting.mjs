import {copyFile} from 'node:fs/promises';
await copyFile(new URL('../products/dd84-desktop/troubleshooting.mjs',import.meta.url),new URL('../backend/shared/troubleshooting.mjs',import.meta.url));
console.log('Updated the backend troubleshooting catalog mirror. Run tests before committing.');
