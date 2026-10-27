'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {IDBFactory}=require('fake-indexeddb');
const Cache=require('../extension/answer-cache.js');
const value=text=>({text,provider:'api',verificationStatus:'completed'});
function fixture(){const indexedDB=new IDBFactory(),store=Cache.create({indexedDB});return {indexedDB,store,restart:()=>Cache.create({indexedDB})};}
async function records(f){const db=await new Promise((resolve,reject)=>{const r=f.indexedDB.open('SuperXAnswers');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const tx=db.transaction(['answers','meta'],'readonly');const rows=tx.objectStore('answers').getAll(),state=tx.objectStore('meta').get('state');const result=await new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve({rows:rows.result,state:state.result});tx.onabort=()=>reject(tx.error);});db.close();return result;}
async function assertBudget(f,limit){const {rows,state}=await records(f);assert.equal(state.bytes,rows.reduce((sum,row)=>sum+Cache.byteSize(row.key,row.value),0));assert.ok(state.bytes<=limit);return rows;}

test('a new instance reads long-lived answers without any TTL or startup bulk load',async()=>{
 const f=fixture();assert.equal(await f.store.ready(),true);await f.store.put('a',{...value('Old but successful'),completedAt:1},10000);assert.equal((await f.restart().get('a')).text,'Old but successful');assert.equal(await f.store.get('absent'),null);
});
test('get touches the indexed LRU so the unaccessed entry is evicted, even on equal wall-clock time',async()=>{
 const f=fixture(),v=value('same'),limit=Cache.byteSize('a',v)*2;await f.store.put('a',v,limit);await f.store.put('b',v,limit);await f.restart().get('a');await f.store.put('c',v,limit);assert.equal(await f.store.get('b'),null);assert.deepEqual((await assertBudget(f,limit)).map(r=>r.key).sort(),['a','c']);
});
test('UTF-8 logical bytes include key and serialized value, replacements update the atomic total',async()=>{
 const f=fixture();assert.equal(Cache.byteSize('中文',value('🌏')),Buffer.byteLength(JSON.stringify(['中文',value('🌏')])));
 await f.store.put('a',value('x'.repeat(2000)),10000);await f.store.put('a',value('short'),10000);assert.equal((await assertBudget(f,10000)).length,1);await f.store.put('a',value('y'.repeat(4000)),10000);await assertBudget(f,10000);
});
test('oversized replacement preserves the successful old entry instead of deleting it',async()=>{
 const f=fixture();await f.store.put('a',value('success'),200);assert.equal(await f.store.put('a',value('x'.repeat(1000)),200),false);assert.equal((await f.store.get('a')).text,'success');await assertBudget(f,200);
});
test('trim immediately evicts the oldest entries under a reduced budget',async()=>{
 const f=fixture();for(const k of ['a','b','c'])await f.store.put(k,value('same'),10000);const budget=Cache.byteSize('c',value('same'));await f.store.trim(budget);assert.deepEqual((await assertBudget(f,budget)).map(r=>r.key),['c']);
});
test('ten concurrent writes across store instances cannot race the byte counter or exceed the limit',async()=>{
 const f=fixture(),v=value('x'.repeat(100)),limit=Cache.byteSize('0',v)*3;await Promise.all(Array.from({length:10},(_,i)=>f.restart().put(String(i),v,limit)));assert.equal((await assertBudget(f,limit)).length,3);
});
test('replacement and ten concurrent LRU reads/writes remain atomic',async()=>{
 const f=fixture();await f.store.put('a',value('seed'),5000);await Promise.all(Array.from({length:10},(_,i)=>i%2?f.restart().get('a'):f.restart().put('a',value('x'.repeat(i*100)),5000)));assert.equal((await assertBudget(f,5000)).length,1);
});
test('clear queued behind in-flight puts commits after them; later reads cannot revive them',async()=>{
 const f=fixture();await f.store.ready();const writes=Array.from({length:10},(_,i)=>f.store.put(String(i),value('x'),10000));const clearing=f.store.clear();await Promise.all([...writes,clearing]);assert.deepEqual(await assertBudget(f,0),[]);assert.equal(await f.restart().get('0'),null);
});
test('migration is atomic and only runs once across worker instances; clear prevents re-import',async()=>{
 const f=fixture();await Promise.all([f.store.migrate([['a',value('first')]],10000),f.restart().migrate([['b',value('second')]],10000)]);assert.equal((await records(f)).rows.length,1);await f.store.clear();await f.restart().migrate([['a',value('revived')]],10000);assert.deepEqual((await records(f)).rows,[]);
});
test('provider invalidation preserves independent providers and the current OAuth credential',async()=>{
 const f=fixture(),a=JSON.stringify(['v','oauth',['account-a']]),b=JSON.stringify(['v','oauth',['account-b']]);await f.store.put(a,{...value('A'),provider:'oauth'},10000);await f.store.put(b,{...value('B'),provider:'oauth'},10000);await f.store.put('api',value('API'),10000);await f.store.removeProvider('oauth','account-b');assert.equal(await f.store.get(a),null);assert.equal((await f.store.get(b)).text,'B');await f.store.removeProvider('oauth');assert.equal(await f.store.get(b),null);assert.equal((await f.store.get('api')).text,'API');await assertBudget(f,10000);
});
test('database open errors reject rather than silently using an in-memory fallback',async()=>{
 const store=Cache.create({indexedDB:{open(){throw new Error('Unavailable storage');}}});await assert.rejects(store.ready());await assert.rejects(store.put('a',value('x'),1000));
});

test('transaction abort rolls back both answer replacement and the byte counter',async()=>{
 const f=fixture();await f.store.put('a',value('original'),10000);await assert.rejects(f.store.put('a',{...value('cannot clone'),bad(){}},10000));assert.equal((await f.store.get('a')).text,'original');await assertBudget(f,10000);await f.store.put('b',value('still usable'),10000);await assertBudget(f,10000);
});
