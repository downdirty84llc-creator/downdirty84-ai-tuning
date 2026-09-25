import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFixture} from '../scripts/build-wire-fixture.mjs';
import {WireParser,decodeRecord,crc32,FD_LENGTHS} from '../shared/wire.mjs';

const session='72623859790382856';
const fixture=buildFixture();
let bytes;
try { bytes=readFileSync(fixture.path); } finally { fixture.cleanup(); }
const first=bytes.subarray(0,112);
const edit=(offset,value,source=first)=>{
  const b=Buffer.from(source); b[offset]=value; b.writeUInt32LE(crc32(b.subarray(0,108)),108); return b;
};
test('C encoder round-trips 10,000 mixed records and separate queue status',()=>{
  const parser=new WireParser(session); const records=[];
  for(let i=0;i<bytes.length;i+=317) records.push(...parser.feed(bytes.subarray(i,i+317)));
  assert.equal(records.length,10001); assert.equal(parser.bufferedBytes,0);
  for(let i=0;i<10000;i++) {
    const fd=!!(i%2),length=FD_LENGTHS[fd?Math.floor(i/2)%16:Math.floor(i/2)%9];
    assert.deepEqual(records[i],{type:'frame',session,sequence:i,timestampUs:(9007199254740993n+BigInt(i)).toString(),
      id:i%3===0?0x1fffffff:0x7ff,channel:Math.floor(i/2)%2,extended:i%3===0,fd,brs:fd&&i%4===1,
      dlc:fd?Math.floor(i/2)%16:Math.floor(i/2)%9,length,
      data:Buffer.from(Array.from({length},(_,j)=>(i+j)&255)).toString('hex')});
  }
  assert.deepEqual(records.at(-1).counters,{accepted:'10000',drained:'10000',droppedFull:'0',rejectedInvalid:'0',rejectedNotReady:'0',rejectedTimestamp:'0',queued:'0',highWater:'1'});
  assert.equal(records.at(-1).hardwareOverruns,null);
});
test('CRC reference and independent frozen golden vector',()=>{
  assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
  const golden=readFileSync(new URL('./fixtures/wire-v1.hex',import.meta.url),'utf8').trim();
  assert.equal(first.toString('hex'),golden);
  assert.equal(decodeRecord(Buffer.from(golden,'hex')).timestampUs,'9007199254740993');
});
test('every split, joined records and disconnect retain sequence evidence',()=>{
  for(let split=1;split<112;split++) {
    const p=new WireParser(session);
    assert.deepEqual(p.feed(first.subarray(0,split)),[]);
    assert.equal(p.feed(first.subarray(split))[0].type,'frame');
  }
  const p=new WireParser(session);
  assert.equal(p.feed(bytes.subarray(0,224)).length,2);
  p.feed(first.subarray(0,60)); assert.equal(p.disconnect().discardedBytes,60);
  assert.equal(p.feed(first)[0].type,'duplicateOrStale');
  assert.equal(p.feed(bytes.subarray(224,336))[0].sequence,2);
});
test('bad header, CRC, metadata, padding and lengths rejected then stream recovers',()=>{
  const corrupt=Buffer.from(first);corrupt[80]^=1;
  for(const bad of [corrupt,edit(4,2),edit(5,99),edit(6,255),edit(7,255),edit(32,2),
    edit(33,8),edit(34,16),edit(35,64),edit(100,1),edit(33,4),edit(33,0)]) {
    assert.throws(()=>decodeRecord(bad));
    const p=new WireParser(session);const events=p.feed(Buffer.concat([bad,first]));
    assert.ok(events.some(e=>e.type==='invalid'));
    assert.equal(events.filter(e=>e.type==='frame').length,1);
  }
  const p=new WireParser(session);
  p.feed(first.subarray(0,70));
  assert.equal(p.feed(first).filter(e=>e.type==='frame').length,1);
  assert.throws(()=>p.feed(Buffer.alloc(4097)),/chunk limit/);
  for(let i=0;i<100;i++) p.feed(Buffer.alloc(4096,0xff));
  assert.ok(p.bufferedBytes<112);
  assert.equal(p.feed(first)[0].type,'duplicateOrStale');
});
test('gaps, session isolation, time regression and no sequence wrap',()=>{
  const p=new WireParser(session);
  assert.deepEqual(p.feed(bytes.subarray(224,336))[0],{type:'gap',from:0,to:1,count:2});
  assert.equal(p.feed(first)[0].type,'duplicateOrStale');
  assert.equal(p.feed(edit(8,9))[0].type,'wrongSession');
  const backwards=edit(16,3); assert.equal(p.feed(backwards)[0].type,'timestampRegression');
  const max=Buffer.from(first);max.writeUInt32LE(0xffffffff,16);max.writeUInt32LE(crc32(max.subarray(0,108)),108);
  const q=new WireParser(session);assert.equal(q.feed(max).at(-1).sequence,0xffffffff);
  assert.equal(q.feed(first)[0].type,'duplicateOrStale');
  assert.equal(new WireParser(session).feed(first)[0].type,'frame');
  assert.throws(()=>new WireParser(0));
});
test('status accounting and reserved bytes are enforced',()=>{
  const status=bytes.subarray(-112);
  for(const bad of [edit(28,0,status),edit(85,2,status),edit(92,1,status)])
    assert.throws(()=>decodeRecord(bad));
});
