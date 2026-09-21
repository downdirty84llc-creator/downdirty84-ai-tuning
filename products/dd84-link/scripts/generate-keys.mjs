import { generateKeyPairSync, randomBytes } from 'node:crypto';
const {privateKey}=generateKeyPairSync('ed25519');
console.log('DD84_LINK_SIGNING_PRIVATE_KEY='+privateKey.export({type:'pkcs8',format:'pem'}).replaceAll('\n','\\n'));
console.log('DD84_LINK_DEVICE_KEY='+randomBytes(32).toString('hex'));
console.log('Local development secrets: keep out of source control and logs.');
