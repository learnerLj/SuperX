'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {IDBFactory}=require('fake-indexeddb');
const {IDBKeyRange}=require('fake-indexeddb');
const Cache=require('../extension/answer-cache.js');
const value=text=>({text,provider:'api',verificationStatus:'completed'});
function fixture(){const indexedDB=new IDBFactory(),store=Cache.create({indexedDB,keyRange:IDBKeyRange});return {indexedDB,store,restart:()=>Cache.create({indexedDB,keyRange:IDBKeyRange})};}
async function records(f){const db=await new Promise((resolve,reject)=>{const r=f.indexedDB.open('SuperXAnswers');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const tx=db.transaction(['answers','meta','posts'],'readonly');const rows=tx.objectStore('answers').getAll(),posts=tx.objectStore('posts').getAll(),state=tx.objectStore('meta').get('state');const result=await new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve({rows:rows.result,posts:posts.result,state:state.result});tx.onabort=()=>reject(tx.error);});db.close();return result;}
// Full recompute over both stores plus the R3 record invariants.
async function assertBudget(f,limit){const {rows,posts,state}=await records(f);
 const ids=new Set(posts.map(p=>p.id));
 for(const row of rows){assert.equal(row.bytes,Cache.byteSize(row.key,row.value));if(row.postId)assert.ok(ids.has(row.postId),`answer ${row.key} points to missing post ${row.postId}`);}
 for(const post of posts){assert.equal(post.bytes,Cache.postBytes(post));assert.ok(post.comments?.length||rows.some(r=>r.postId===post.id),`post ${post.id} has no answer and no comments`);}
 assert.equal(state?.bytes||0,rows.reduce((sum,row)=>sum+Cache.byteSize(row.key,row.value),0)+posts.reduce((sum,post)=>sum+Cache.postBytes(post),0));assert.ok((state?.bytes||0)<=limit);return rows;}

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

test('readPage uses bounded exclusive primary-key pages without changing LRU or meta',async()=>{
 const f=fixture(),reader=Cache.create({indexedDB:f.indexedDB,keyRange:IDBKeyRange});
 await f.store.migrate(Array.from({length:300},(_,i)=>[String(i).padStart(4,'0'),value('中文 '+i)]),1000000);
 const before=await records(f),keys=[];let after,pages=0;
 do{const page=await reader.readPage({after});pages++;assert.ok(page.items.length<=128);keys.push(...page.items.map(r=>r.key));after=page.next??undefined;}while(after!==undefined);
 assert.equal(pages,3);assert.equal(keys.length,300);assert.equal(new Set(keys).size,300);assert.deepEqual(keys,before.rows.map(r=>r.key));assert.deepEqual(await records(f),before);
 await reader.close();await f.store.put('worker-still-open',value('yes'),1000000);assert.equal((await f.store.get('worker-still-open')).text,'yes');
});

test('readPage honors UTF-8 byte and count budgets and advances over one oversized record',async()=>{
 const f=fixture(),reader=Cache.create({indexedDB:f.indexedDB,keyRange:IDBKeyRange});
 await f.store.migrate([['a',value('中'.repeat(220000))],['b',value('文'.repeat(220000))],['c',value('x'.repeat(1100000))],['d',value('last')]],10000000);
 const a=await reader.readPage();assert.deepEqual(a.items.map(r=>r.key),['a']);assert.equal(a.next,'a');
 const b=await reader.readPage({after:a.next});assert.deepEqual(b.items.map(r=>r.key),['b']);
 const c=await reader.readPage({after:b.next});assert.deepEqual(c.items.map(r=>r.key),['c']);assert.equal(c.next,'c');
 const d=await reader.readPage({after:c.next});assert.deepEqual(d.items.map(r=>r.key),['d']);assert.equal(d.next,null);
 const bounded=await reader.readPage({limit:1000,maxBytes:100000000});assert.deepEqual(bounded.items.map(r=>r.key),['a']);
 const small=await reader.readPage({limit:1,maxBytes:50});assert.equal(small.items.length,1);assert.equal(small.next,'a');await reader.close();
});

test('readPage handles empty, deleted cursors, insertions on either side and clear between batches',async()=>{
 const f=fixture(),reader=Cache.create({indexedDB:f.indexedDB,keyRange:IDBKeyRange});
 assert.deepEqual(await reader.readPage(),{items:[],next:null});
 await f.store.migrate(['b','d','f'].map(k=>[k,value(k)]),10000);const first=await reader.readPage({limit:1});
 await f.store.clear();await f.store.put('a',value('behind'),10000);await f.store.put('c',value('ahead'),10000);await f.store.put('e',value('ahead'),10000);
 const second=await reader.readPage({after:first.next,limit:1});assert.deepEqual(second.items.map(r=>r.key),['c']);
 await f.store.clear();assert.deepEqual(await reader.readPage({after:second.next}),{items:[],next:null});await reader.close();
});

test('readPage reports corrupt values to its consumer and never trusts persisted byte accounting',async()=>{
 const f=fixture(),reader=Cache.create({indexedDB:f.indexedDB,keyRange:IDBKeyRange});await f.store.ready();
 const db=await new Promise(resolve=>{const r=f.indexedDB.open('SuperXAnswers');r.onsuccess=()=>resolve(r.result);});
 const tx=db.transaction('answers','readwrite');tx.objectStore('answers').put({key:'a',bytes:0,value:{text:'x'.repeat(1100000)}});tx.objectStore('answers').put({key:'b',value:null});
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 const first=await reader.readPage();assert.equal(first.items.length,1);assert.equal(first.next,'a');assert.deepEqual(await reader.readPage({after:'a'}),{items:[{key:'b',value:null,post:null}],next:null});await reader.close();
});

test('readPage requires an injected key range only for a resumed page in Node; close releases its handle',async()=>{
 const indexedDB=new IDBFactory(),reader=Cache.create({indexedDB});await reader.ready();await assert.rejects(reader.readPage({after:'a'}),/IDBKeyRange/);await reader.close();await reader.close();
 await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('SuperXAnswers');r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('export reader leaked its database'));});
});

// ---- v2 post records (Issue #3 stage B) ----
const apiKey=(url,{provider='api',credential='grok-4',prompt='fact-check-prompts-v2-deeper',language='zh-CN'}={})=>JSON.stringify(['GrokFirst-v1',provider,credential,'auto',true,true,'api-v11-context-images','custom','only',JSON.stringify(['post-input-v4-source-full-url',provider,url,language]),prompt,'p','high']);
const nativeKey=url=>JSON.stringify(['SuperX-native-answers-v1','x-native','@me',url,'auto','en','native-prompt-v1-fast-markdown-format','x','fast']);
const done=value=>({...value,completedAt:value.completedAt??1});
async function backfilled(f){while(!(await f.store.backfill(2)));}
async function v1Database(indexedDB,rows){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('SuperXAnswers',1);r.onupgradeneeded=()=>{const a=r.result.createObjectStore('answers',{keyPath:'key'});a.createIndex('lastAccess','lastAccess');a.createIndex('provider','provider');r.result.createObjectStore('meta');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const tx=db.transaction(['answers','meta'],'readwrite');let bytes=0,clock=0;
 for(const [key,v,provider] of rows){const size=Cache.byteSize(key,v);bytes+=size;tx.objectStore('answers').put({key,value:v,bytes:size,provider,lastAccess:++clock});}
 tx.objectStore('meta').put({bytes,clock,migrated:true},'state');
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
}

test('v1 to v2 upgrade backfills postId in resumable batches and creates URL-only posts with exact bytes',async()=>{
 const f=fixture();
 const keys=[apiKey('https://x.com/alice/status/1'),apiKey('https://twitter.com/Alice/status/1',{prompt:'fact-check-prompts-v1'}),nativeKey('https://x.com/i/web/status/2'),
  apiKey('https://x.com/bob/status/3',{provider:'oauth',credential:['acct','grok-4-oauth']}),'not json',JSON.stringify(['unknown','https://x.com/a/status/9'])];
 await v1Database(f.indexedDB,keys.map((k,i)=>[k,done({...value('v'+i),completedAt:100+i}),i===2?'x-native':i===3?'oauth':'api']));
 assert.equal(await f.store.backfill(2),false);assert.equal(await f.store.migrateHistory([],Date.now(),1e9),'pending');
 await backfilled(f);assert.equal(await f.store.backfill(2),true);
 const {rows,posts}=await records(f);
 assert.deepEqual(Object.fromEntries(rows.map(r=>[r.key,r.postId])),Object.fromEntries(keys.map((k,i)=>[k,['1','1','2','3','',''][i]])));
 assert.deepEqual(posts.map(p=>[p.id,p.url,'text' in p]).sort(),[['1','https://x.com/alice/status/1',false],['2','https://x.com/i/web/status/2',false],['3','https://x.com/bob/status/3',false]]);
 assert.equal(posts.find(p=>p.id==='1').activityAt,101);
 await assertBudget(f,1e9);
 assert.deepEqual(await f.store.usage(),{bytes:(await records(f)).state.bytes,records:3,answers:6});
});

test('unparsable keys stay orphans and are evicted before any post group',async()=>{
 const f=fixture();await backfilled(f);
 const a=apiKey('https://x.com/alice/status/1'),v=done(value('same'));
 await f.store.put(a,v,1e6);await f.store.put('orphan-1',v,1e6);await f.store.put('orphan-2',v,1e6);await f.store.get('orphan-1');
 const limit=(await records(f)).state.bytes-1;await f.store.trim(limit);
 assert.deepEqual((await assertBudget(f,limit)).map(r=>r.key).sort(),[a,'orphan-1'].sort());
 await f.store.trim(limit-Cache.byteSize('orphan-1',v));assert.deepEqual((await assertBudget(f,limit)).map(r=>r.key),[a]);
});

test('a get refreshes the post LRU and shrinking deletes whole post groups oldest-used first',async()=>{
 const f=fixture();await backfilled(f);const v=done(value('x'.repeat(50)));
 const k=(id,model)=>apiKey(`https://x.com/u/status/${id}`,{credential:model});
 for(const id of ['1','2','3'])for(const m of ['m1','m2'])await f.store.put(k(id,m),v,1e6);
 assert.equal((await f.store.get(k('1','m2'))).text,v.text);
 const {posts}=await records(f);assert.ok(posts.find(p=>p.id==='1').lastUsed>posts.find(p=>p.id==='3').lastUsed);
 const per=(await records(f)).state.bytes/3;await f.store.trim(Math.floor(per*2));
 const after=await records(f);assert.deepEqual(after.posts.map(p=>p.id).sort(),['1','3']);
 assert.deepEqual(after.rows.map(r=>r.postId).sort(),['1','1','3','3']);await assertBudget(f,per*2);
});

test('removeProvider deletes posts left without answers or comments in the same transaction',async()=>{
 const f=fixture();await backfilled(f);const v=done(value('x'));
 const oauthA=apiKey('https://x.com/a/status/1',{provider:'oauth',credential:['acct-a','m']}),oauthB=apiKey('https://x.com/a/status/2',{provider:'oauth',credential:['acct-b','m']});
 await f.store.put(oauthA,{...v,provider:'oauth'},1e6);await f.store.put(oauthB,{...v,provider:'oauth'},1e6);
 await f.store.put(apiKey('https://x.com/a/status/2'),v,1e6);
 await f.store.putComments({url:'https://x.com/a/status/3',text:'c'},{comments:['hi'],completedAt:5},1e6,10);
 await f.store.put(apiKey('https://x.com/a/status/3',{provider:'oauth',credential:['acct-a','m']}),{...v,provider:'oauth'},1e6);
 assert.equal(await f.store.removeProvider('oauth','acct-b'),true);
 const {posts}=await records(f);assert.deepEqual(posts.map(p=>p.id).sort(),['2','3']);await assertBudget(f,1e6);
 assert.equal(await f.store.removeProvider('oauth'),true);assert.deepEqual((await records(f)).posts.map(p=>p.id).sort(),['2','3']);await assertBudget(f,1e6);
});

test('randomized operations keep bytes equal to a full recompute and every record non-empty',async()=>{
 let seed=20261109;const rand=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n;};
 const f=fixture();await backfilled(f);let limit=4000;
 const ids=['1','2','3','4','5','6'],models=['a','b'];
 const key=()=>rand(8)===0?`orphan-${rand(3)}`:apiKey(`https://x.com/u/status/${ids[rand(ids.length)]}`,{provider:rand(3)?'api':'oauth',credential:rand(2)?models[rand(2)]:[`acct-${rand(2)}`,'m']});
 for(let step=0;step<250;step++){
  const op=rand(10);
  if(op<4){const k=key(),provider=identity(k)[1]||'api';await f.store.put(k,{...done(value('t'.repeat(rand(600)))),provider,completedAt:step},limit,rand(2)?{url:`https://x.com/u/status/${JSON.parse(JSON.parse(k)[9]||'[0,0,"x"]')[2]?.split('/').pop()}`,text:'snap '+step,author:'@u'}:undefined);}
  else if(op<5)await f.store.get(key());
  else if(op<6)await f.store.putComments({url:`https://x.com/u/status/${ids[rand(ids.length)]}`,text:'p'},{comments:['c'.repeat(rand(300)+1)],completedAt:step},limit,step);
  else if(op<7)await f.store.removeProvider('oauth',rand(2)?'acct-0':undefined);
  else if(op<8){limit=2000+rand(4000);await f.store.trim(limit);}
  else if(op<9)await f.store.deletePost(ids[rand(ids.length)]);
  else if(rand(5)===0)await f.store.clear();
  await assertBudget(f,limit);
 }
 function identity(k){try{return JSON.parse(k);}catch{return [];}}
});

test('clear racing record writes removes posts too and cannot be revived',async()=>{
 const f=fixture();await backfilled(f);
 const writes=Array.from({length:6},(_,i)=>f.store.put(apiKey(`https://x.com/u/status/${i+1}`),done(value('x')),1e6,{url:`https://x.com/u/status/${i+1}`,text:'t'}));
 const comments=f.store.putComments({url:'https://x.com/u/status/9',text:'t'},{comments:['c']},1e6,1);
 const clearing=f.store.clear();await Promise.all([...writes,comments,clearing]);
 assert.deepEqual(await assertBudget(f,0),[]);assert.deepEqual((await records(f)).posts,[]);assert.equal((await f.store.records()).items.length,0);
});

test('records pages by [activityAt,id] descending without duplicates or gaps and searches answer, post and comment text',async()=>{
 const f=fixture();await backfilled(f);
 for(let i=1;i<=120;i++)await f.store.put(apiKey(`https://x.com/u/status/${i}`),done({...value(i===7?'NEEDLE in answer':'a'+i),completedAt:i%40}),1e9,{url:`https://x.com/u/status/${i}`,text:i===80?'post Needle':'p',author:i===90?'@needleAuthor':'@u'});
 await f.store.putComments({url:'https://x.com/u/status/100',text:'p'},{comments:['a needle comment'],completedAt:39},1e9,39);
 const seen=[];let after,pages=0;
 do{const page=await f.store.records({after});pages++;assert.ok(page.items.length<=Cache.RECORD_PAGE_SIZE);seen.push(...page.items.map(i=>[i.post.activityAt,i.post.id]));after=page.next??undefined;}while(after);
 assert.equal(pages,3);assert.equal(seen.length,120);assert.equal(new Set(seen.map(s=>s[1])).size,120);
 const sorted=[...seen].sort((a,b)=>b[0]-a[0]||(b[1]<a[1]?-1:b[1]>a[1]?1:0));assert.deepEqual(seen,sorted);
 const hits=await f.store.records({query:'  NEEDLE '});assert.deepEqual(hits.items.map(i=>i.post.id).sort(),['100','7','80','90']);assert.equal(hits.next,null);
 const first=await f.store.records({query:'needle',limit:2});assert.equal(first.items.length,2);assert.ok(first.next);
 const rest=await f.store.records({query:'needle',after:first.next});assert.deepEqual([...first.items,...rest.items].map(i=>i.post.id).sort(),['100','7','80','90']);
 const item=(await f.store.records({query:'NEEDLE in answer'})).items[0];assert.equal(item.answers[0].value.text,'NEEDLE in answer');
});

test('record versions are newest-first and search stops at the 8 MB budget with a resumable cursor',async()=>{
 const f=fixture();await backfilled(f);const big='z'.repeat(1024*1024);
 await f.store.put(apiKey('https://x.com/u/status/1',{credential:'old'}),done({...value('needle old version'),completedAt:1}),1e9);
 await f.store.put(apiKey('https://x.com/u/status/1',{credential:'new'}),done({...value('new version'),completedAt:2}),1e9);
 for(let i=2;i<=11;i++)await f.store.put(apiKey(`https://x.com/u/status/${i}`),done({...value(big),completedAt:10+i}),1e9);
 const [only]=(await f.store.records({after:[3,'99']})).items;assert.deepEqual(only.answers.map(a=>a.value.text),['new version','needle old version']);
 let page=await f.store.records({query:'needle'}),calls=1;assert.deepEqual(page.items,[]);assert.ok(page.next);
 while(page.next&&!page.items.length){page=await f.store.records({query:'needle',after:page.next});calls++;}
 assert.equal(page.items[0].post.id,'1');assert.ok(calls>1);
});

test('usage reads bytes, record count and answer count together',async()=>{
 const f=fixture();await backfilled(f);assert.deepEqual(await f.store.usage(),{bytes:0,records:0,answers:0});
 await f.store.put(apiKey('https://x.com/u/status/1'),done(value('a')),1e6);await f.store.put('orphan',done(value('b')),1e6);
 await f.store.putComments({url:'https://x.com/u/status/2',text:'t'},{comments:['c']},1e6,1);
 const {state}=await records(f);assert.deepEqual(await f.store.usage(),{bytes:state.bytes,records:2,answers:2});
 await f.store.clear();assert.deepEqual(await f.store.usage(),{bytes:0,records:0,answers:0});
});

test('legacy 24-hour history migrates only snapshots and comments of answered or commented posts, once',async()=>{
 const f=fixture(),now=Date.UTC(2026,10,9);
 await v1Database(f.indexedDB,[[apiKey('https://x.com/alice/status/1'),done(value('cached')),'api'],[apiKey('https://x.com/old/status/4'),done(value('cached old')),'api']]);
 const legacy=[
  {id:'1',url:'https://x.com/alice/status/1',text:'alice post',author:'Alice',language:'en',hasMedia:true,firstViewedAt:now-5000,lastViewedAt:now-1000,visits:4,
   analysis:{text:'saved analysis',provider:'api'},analysisScope:'api'},
  {id:'2',url:'https://x.com/i/web/status/2',text:'web form',author:'',language:'zh',lastViewedAt:now-3000,visits:1,
   comments:['old draft'],commentsCompletedAt:now-3000,commentsLanguage:'zh',commentsScope:'api'},
  {id:'2',url:'https://x.com/bob/status/2',text:'bob post',author:'Bob',language:'zh',lastViewedAt:now-2000,visits:2,
   comments:['newer draft'],commentsCompletedAt:now-2000,commentsLanguage:'zh',commentsScope:'oauth:abc-123',commentsModel:'grok-4',commentsUsage:{total_tokens:5,secret:'x'}},
  {id:'3',url:'https://x.com/carol/status/3',text:'visited only',lastViewedAt:now-1000,visits:3},
  {id:'4',url:'https://x.com/old/status/4',text:'expired',lastViewedAt:now-25*3600*1000,visits:1},
  {id:'5',url:'https://x.com/dan/status/5',text:'native',lastViewedAt:now-1000,comments:['n'],commentsScope:'x-native'},
 ];
 assert.equal(await f.store.migrateHistory(legacy,now,1e9),'pending');assert.equal((await records(f)).posts.length,0);
 await backfilled(f);
 await assert.rejects(f.store.migrateHistory([{get url(){throw new Error('write failed');}}],now,1e9));
 assert.equal(await f.store.migrateHistory(legacy,now,1e9),'done');
 const {posts}=await records(f),by=Object.fromEntries(posts.map(p=>[p.id,p]));
 assert.deepEqual(Object.keys(by).sort(),['1','2','4']);
 assert.equal(by['1'].text,'alice post');assert.equal(by['1'].author,'Alice');assert.equal(by['1'].hasMedia,true);
 assert.equal('text' in by['4'],false,'an expired entry adds no snapshot');
 assert.equal(by['2'].url,'https://x.com/bob/status/2');assert.equal(by['2'].text,'bob post');assert.deepEqual(by['2'].comments,['newer draft']);
 assert.equal(by['2'].commentsScope,'oauth:abc-123');assert.deepEqual(by['2'].commentsUsage,{total_tokens:5});assert.equal(by['2'].activityAt,now-2000);
 for(const post of posts)for(const field of ['visits','firstViewedAt','lastViewedAt','analysis','analysisScope'])assert.equal(field in post,false);
 await assertBudget(f,1e9);const before=await records(f);
 assert.equal(await f.store.migrateHistory([{...legacy[3],comments:['late']}],now,1e9),'done');assert.deepEqual(await records(f),before);
 await f.store.clear();assert.equal(await f.store.migrateHistory(legacy,now,1e9),'done');assert.deepEqual((await records(f)).posts,[]);
});
