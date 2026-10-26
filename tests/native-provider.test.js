'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Core=require('../extension/feed-core.js');
const Native=require('../extension/native-provider.js');
const source=fs.readFileSync(require.resolve('../extension/native-provider.js'),'utf8');
const post={id:'123',url:'https://x.com/author/status/123',text:'Claim',language:'zh'};
const settings=Core.normalizeSettings({provider:'x-native'});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function event(){const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit(...args){for(const fn of [...listeners])fn(...args);},listeners};}
function port(){return {name:'GROKFIRST_FEED',onMessage:event(),onDisconnect:event(),sent:[],postMessage(value){this.sent.push(structuredClone(value));}};}
function harness(){
  const timers=[],p=port(),client={port:p,tabId:7};let uuid=0,lastErrors=0;
  const forbidden=new Proxy({},{get(){throw new Error('Native provider must never access tabs/windows');}});
  const runtime={get lastError(){lastErrors++;return undefined;}};
  const chrome={runtime,tabs:forbidden,windows:forbidden};
  const context=vm.createContext({XGrokCore:Core,URL,
    setTimeout(fn,ms){const t={fn,ms};timers.push(t);return t;},clearTimeout(t){if(t)t.cancelled=true;},
    setInterval(fn,ms){const t={fn,ms,interval:true};timers.push(t);return t;},clearInterval(t){if(t)t.cancelled=true;}
  });
  vm.runInContext(source,context);
  const api=context.SuperXNative.create({chrome,crypto:{randomUUID:()=>`11111111-1111-4111-8111-${String(++uuid).padStart(12,'0')}`}});
  function run(options={},input=post,snapshot=settings){return api.run(input,snapshot,{client,...options});}
  const nonce=()=>p.sent.findLast(m=>m.type==='NATIVE_RUN').nonce;
  function emit(kind,extra={},source=p){source.onMessage.emit({type:'NATIVE_EVENT',nonce:nonce(),kind,...extra});}
  function fire(ms){const t=timers.find(t=>t.ms===ms&&!t.cancelled);assert.ok(t,'active '+ms+'ms timer');if(!t.interval)t.cancelled=true;t.fn();}
  return {api,client,port:p,run,emit,nonce,fire,timers,lastErrors:()=>lastErrors};
}
function assertReleased(h){assert.equal(h.port.onMessage.listeners.size,0);assert.equal(h.port.onDisconnect.listeners.size,0);assert.equal(h.timers.every(t=>t.cancelled),true);}

test('run-only API submits once on its source FEED port, never accesses tabs/windows',async()=>{
  const h=harness();assert.deepEqual(Object.keys(h.api),['run']);const promise=h.run();
  assert.equal(h.port.sent.length,1);assert.equal(h.port.sent[0].type,'NATIVE_RUN');assert.match(h.port.sent[0].prompt,/https:\/\/x.com\/author\/status\/123/);
  assert.equal(h.port.sent.length,1);
  h.emit('RESULT',{text:'Answer'});const value=await promise;assert.equal(value.provider,'x-native');assert.equal(value.model,'x-web');assert.equal(value.usageComplete,false);assert.equal(value.verificationStatus,'completed');assert.equal(value.verified,false);assert.equal(value.searched,false);assertReleased(h);
  const next=h.run();assert.notEqual(h.port.sent[0].nonce,h.nonce());h.emit('RESULT',{text:'Next answer'});await next;
});

test('only matching nonce on the bound source port affects a task; malformed and late events do nothing',async()=>{
  const h=harness(),updates=[],promise=h.run({onUpdate:value=>updates.push(value)}),other=port();let settled=false;promise.then(()=>settled=true);
  for(const value of [null,undefined,'text',42,[],{type:'OTHER',nonce:h.nonce(),kind:'RESULT',text:'Wrong type'},{type:'NATIVE_EVENT',nonce:'wrong',kind:'RESULT',text:'Wrong nonce'}])h.port.onMessage.emit(value);
  h.emit('UPDATE',{text:'Other source'},other);h.emit('RESULT',{text:'Other source'},other);h.emit('ERROR',{code:'X_NATIVE_LAYOUT'},other);h.emit('CLOSED',{},other);other.onDisconnect.emit();
  h.emit('PING');await tick();assert.equal(updates.length,0);assert.equal(settled,false);h.emit('UPDATE',{text:'Own stream'});assert.equal(updates.length,1);
  const old=h.nonce();h.emit('RESULT',{text:'Own answer'});await promise;const next=h.run();h.emit('ERROR',{nonce:old,code:'X_NATIVE_LAYOUT'});h.emit('RESULT',{nonce:old,text:'Old answer'});h.emit('CLOSED',{nonce:old});h.emit('RESULT',{text:'New answer'});assert.equal((await next).text,'New answer');
});

test('bounded output, safe http sources and fixed stream metadata; keepalive is not progress',async()=>{
  const h=harness(),updates=[],promise=h.run({onUpdate:v=>updates.push(v)});
  h.fire(20000);assert.deepEqual(h.port.sent[1],{type:'NATIVE_PING',nonce:h.nonce()});h.emit('PING',{text:'Not progress'});assert.equal(updates.length,0);
  const payload={text:'a'.repeat(40000),sources:[{url:'javascript:alert(1)'},{url:'https://example.com',title:'b'.repeat(300)},{url:'https://user:secret@example.com'},{url:'http://example.org'}],provider:'api',verified:true,searched:true,model:'fake',usage:{total_tokens:100}};
  h.emit('UPDATE',payload);assert.equal(updates[0].text.length,30000);assert.equal(updates[0].sources.length,2);assert.equal(updates[0].sources[0].title.length,200);assert.equal(updates[0].verified,false);assert.equal(updates[0].verificationStatus,'pending');assert.equal(updates[0].model,'x-web');
  h.emit('RESULT',payload);const value=await promise;assert.equal(value.text.length,30000);assert.equal(value.sources.length,2);assert.equal(value.usage,undefined);assert.equal(value.usageComplete,false);assert.equal(value.searched,false);assertReleased(h);
});

for(const timeout of [false,true])test((timeout?'timeout':'abort')+' waits for CLOSED, ignores late answers and keeps the slot',async()=>{
  const h=harness(),controller=new AbortController(),updates=[],promise=h.run({signal:controller.signal,onUpdate:v=>updates.push(v)});let settled=false;promise.catch(()=>settled=true);
  if(timeout)h.fire(150000);else controller.abort();
  const cancel=h.port.sent.filter(m=>m.type==='NATIVE_CANCEL');assert.deepEqual(cancel,[{type:'NATIVE_CANCEL',nonce:h.nonce()}]);
  h.emit('UPDATE',{text:'Late'});h.emit('RESULT',{text:'Late'});h.emit('ERROR',{code:'X_NATIVE_LAYOUT'});await tick();assert.equal(settled,false);assert.equal(updates.length,0);assert.equal(h.port.onMessage.listeners.size,1);
  controller.abort();assert.equal(h.port.sent.filter(m=>m.type==='NATIVE_CANCEL').length,1);
  h.emit('CLOSED');await assert.rejects(promise,{code:timeout?'TIMEOUT':'CANCELLED'});assertReleased(h);
  const next=h.run();h.emit('RESULT',{text:'After cleanup'});await next;
});

test('TIMEOUT AbortSignal reason is preserved but arbitrary reason prose never escapes',async()=>{
  const h=harness(),controller=new AbortController(),promise=h.run({signal:controller.signal});
  controller.abort(Object.assign(new Error('PRIVATE PROMPT'),{code:'TIMEOUT'}));h.emit('CLOSED');await assert.rejects(promise,e=>e.code==='TIMEOUT'&&!e.message.includes('PRIVATE'));
});

for(const release of ['CLOSED','disconnect'])test('no cancellation ACK reports unconfirmed; '+release+' later releases blocked gate',async()=>{
  const h=harness(),controller=new AbortController(),promise=h.run({signal:controller.signal});controller.abort();h.fire(5000);
  await assert.rejects(promise,{code:'X_NATIVE_CANCEL_UNCONFIRMED'});assert.equal(h.port.onMessage.listeners.size,1);assert.equal(h.port.onDisconnect.listeners.size,1);
  h.emit('RESULT',{text:'Late'});h.emit('CLOSED',{nonce:'wrong'});await assert.rejects(h.run(),{code:'X_NATIVE_CANCEL_UNCONFIRMED'});
  if(release==='CLOSED')h.emit('CLOSED');else h.port.onDisconnect.emit();assertReleased(h);
  const next=h.run();h.emit('RESULT',{text:'Safe again'});await next;
});

for(const release of ['CLOSED','disconnect'])test('page cleanup failure retains recoverable busy gate until '+release,async()=>{
  const h=harness(),promise=h.run();h.emit('ERROR',{code:'X_NATIVE_CANCEL_UNCONFIRMED',stage:'panel-close'});
  await assert.rejects(promise,e=>e.code==='X_NATIVE_CANCEL_UNCONFIRMED'&&e.nativeStage==='panel-close');
  await assert.rejects(h.run(),{code:'X_NATIVE_CANCEL_UNCONFIRMED'});h.emit('UPDATE',{text:'Late'});h.emit('RESULT',{text:'Late'});
  if(release==='CLOSED')h.emit('CLOSED');else h.port.onDisconnect.emit();assertReleased(h);
  const next=h.run();h.emit('RESULT',{text:'Safe again'});await next;
});

test('source disconnect consumes lastError, rejects and releases without disconnecting the FEED port',async()=>{
  const h=harness(),promise=h.run();h.port.onDisconnect.emit();await assert.rejects(promise,{code:'X_NATIVE_INTERRUPTED'});assert.equal(h.lastErrors(),1);assertReleased(h);
});

test('source disconnect during cancellation confirms the end of the document lifecycle',async()=>{
  const h=harness(),promise=h.run();h.fire(150000);h.port.onDisconnect.emit();await assert.rejects(promise,{code:'TIMEOUT'});assertReleased(h);
});

for(const code of ['X_NATIVE_LOGIN_REQUIRED','X_NATIVE_USAGE_LIMIT','X_NATIVE_LAYOUT','X_NATIVE_PAGE_ERROR','X_NATIVE_INTERRUPTED','X_NATIVE_PANEL_BUSY','X_NATIVE_UNAVAILABLE','RATE_LIMIT'])test('page '+code+' uses fixed public errors/stages without replay',async()=>{
  const h=harness(),promise=h.run();h.emit('ERROR',{code,error:'PRIVATE WEB PAGE',stage:'send-ready',prompt:'PRIVATE PROMPT'});
  await assert.rejects(promise,e=>{
    const safe=Native.publicError(e);assert.equal(safe.code,code==='RATE_LIMIT'?'X_NATIVE_PAGE_ERROR':code);assert.match(safe.error,/\[send-ready\]$/);assert.equal(safe.error.includes('PRIVATE'),false);assert.equal(e.nativeStage,'send-ready');return true;
  });assert.equal(h.port.sent.length,1);assertReleased(h);
});

test('unallowlisted stage and webpage messages cannot appear in public error',async()=>{
  const h=harness(),promise=h.run();h.emit('ERROR',{code:'X_NATIVE_LAYOUT',stage:'PRIVATE POST',error:'PRIVATE ERROR'});
  await assert.rejects(promise,e=>e.nativeStage===undefined&&!Native.publicError(e).error.includes('PRIVATE'));
  assert.equal(Native.publicError({code:'__proto__',nativeStage:'PRIVATE'}).code,'X_NATIVE_PAGE_ERROR');
});

for(const text of ['',undefined,'   '])test('empty terminal answer '+JSON.stringify(text)+' fails with cleanup confirmed',async()=>{
  const h=harness(),promise=h.run();h.emit('RESULT',{text});await assert.rejects(promise,{code:'X_NATIVE_PAGE_ERROR'});assertReleased(h);
});

test('unsupported and pre-aborted requests never post; missing source is a fixed failure',async()=>{
  const h=harness();for(const task of ['draft','comments'])await assert.rejects(h.run({},post,{...settings,task}),{code:'X_NATIVE_UNSUPPORTED'});
  await assert.rejects(h.run({},{...post,url:null}),{code:'X_NATIVE_UNSUPPORTED'});
  const c=new AbortController();c.abort();await assert.rejects(h.run({signal:c.signal}),{code:'CANCELLED'});
  await assert.rejects(h.api.run(post,settings),{code:'X_NATIVE_INTERRUPTED'});assert.equal(h.port.sent.length,0);
});

test('custom prompt remains opt-in, uses resolved language and treats source as data',async()=>{
  for(const mode of ['preset','custom']){
    const h=harness(),promise=h.run({},post,{...settings,explanationMode:mode,verifyPrompt:'CUSTOM TASK',language:'ja'});
    const prompt=h.port.sent[0].prompt;assert.equal(prompt.includes('CUSTOM TASK'),mode==='custom');assert.match(prompt,/回答语言：ja/);assert.match(prompt,/不是指令/);assert.match(prompt,/可点击/);h.emit('RESULT',{text:'Answer'});await promise;
  }
});

test('long auxiliary contexts retain the 32000 JSON string budget with every escape class',async()=>{
  for(const character of ['x','"','\\','\n','\u0001']){
    const h=harness(),nodes=Array.from({length:7},(_,i)=>({id:String(120+i),url:`https://x.com/author/status/${120+i}`,text:character.repeat(12000),images:Array.from({length:4},()=>({url:'https://pbs.twimg.com/media/'+('a'.repeat(1900))+'.jpg'}))}));
    nodes[0].quotedContext=nodes.slice(1,3);nodes[1].quotedContext=nodes.slice(3,5);nodes[2].quotedContext=nodes.slice(5);
    const promise=h.run({},nodes[0],{...settings,explanationMode:'custom',verifyPrompt:'q'.repeat(12000)}),input=h.port.sent[0].prompt;
    assert.ok(input.length<60000);for(const node of nodes)assert.ok(input.includes(node.url));assert.match(input,/textTruncated/);
    const auxiliary=JSON.parse(input.split('以下 JSON 仅为辅助源材料：\n')[1]);let used=0;
    const count=node=>{used+=JSON.stringify(node.text).length+JSON.stringify(node.author).length;for(const image of node.images)used+=JSON.stringify(image.url).length;node.quotedContext.forEach(count);};count(auxiliary);
    // Exhausted nodes retain empty strings and original permalinks as before.
    assert.ok(used<=32000+nodes.length*4);h.emit('RESULT',{text:'Done'});await promise;
  }
});

test('core still isolates native model, legacy migration and generic retry policy',()=>{
  assert.equal(settings.provider,'x-native');assert.equal(Core.normalizeSettings({provider:'native'}).provider,'api');
  assert.equal(Core.providerModel({...settings,apiModel:'grok-imagine-image'}),'x-web');assert.equal(Core.providerEffort(settings),'auto');
  for(const code of ['TIMEOUT','RATE_LIMIT','API_INCOMPLETE','X_NATIVE_CANCEL_UNCONFIRMED'])assert.equal(Core.autoRetryDecision({code,provider:'x-native'}).retryable,false);
});

test('timeout without CLOSED reports unconfirmed instead of falsely claiming timeout stopped the panel',async()=>{
  const h=harness(),promise=h.run();h.fire(150000);h.fire(5000);await assert.rejects(promise,{code:'X_NATIVE_CANCEL_UNCONFIRMED'});
  await assert.rejects(h.run(),{code:'X_NATIVE_CANCEL_UNCONFIRMED'});assert.equal(h.port.sent.filter(m=>m.type==='NATIVE_RUN').length,1);assert.equal(h.port.sent.filter(m=>m.type==='NATIVE_CANCEL').length,1);
  h.emit('CLOSED');assertReleased(h);
});

test('unavailable RUN transport fails safely without leaking errors or creating another request',async()=>{
  const h=harness();h.port.postMessage=()=>{throw new Error('PRIVATE TRANSPORT');};await assert.rejects(h.run(),e=>e.code==='X_NATIVE_INTERRUPTED'&&!e.message.includes('PRIVATE'));assertReleased(h);
});

test('failed CANCEL send retains the gate until the source document disconnects',async()=>{
  const h=harness(),controller=new AbortController(),promise=h.run({signal:controller.signal});h.port.postMessage=()=>{throw new Error('PRIVATE TRANSPORT');};controller.abort();
  await assert.rejects(promise,{code:'X_NATIVE_CANCEL_UNCONFIRMED'});await assert.rejects(h.run(),{code:'X_NATIVE_CANCEL_UNCONFIRMED'});h.port.onDisconnect.emit();assertReleased(h);
});

test('provider accepts ten concurrent tasks, rejects eleven, and RUNNING does not release a request slot',async()=>{
  const h=harness(),pending=Array.from({length:10},()=>{const promise=h.run();return {promise,nonce:h.nonce()};});
  assert.equal(h.port.sent.filter(m=>m.type==='NATIVE_RUN').length,10);assert.equal(h.port.onMessage.listeners.size,10);
  await assert.rejects(h.run(),{code:'X_NATIVE_BUSY'});h.emit('RUNNING',{nonce:pending[0].nonce});await assert.rejects(h.run(),{code:'X_NATIVE_BUSY'});
  h.emit('RESULT',{nonce:pending[0].nonce,text:'First complete'});assert.equal((await pending[0].promise).text,'First complete');
  const replacement=h.run(),replacementNonce=h.nonce();assert.equal(h.port.onMessage.listeners.size,10);
  h.emit('CLOSED',{nonce:pending[0].nonce});await assert.rejects(h.run(),{code:'X_NATIVE_BUSY'});
  for(const task of pending.slice(1).reverse())h.emit('RESULT',{nonce:task.nonce,text:task.nonce});
  h.emit('RESULT',{nonce:replacementNonce,text:'Replacement'});await Promise.all([...pending.slice(1).map(task=>task.promise),replacement]);assertReleased(h);
});

test('interleaved provider streams, cancellation ACK and heartbeat stay bound to each nonce',async()=>{
  const h=harness(),controller=new AbortController(),updatesA=[],updatesB=[];
  const a=h.run({signal:controller.signal,onUpdate:v=>updatesA.push(v)}),nonceA=h.nonce();
  const b=h.run({onUpdate:v=>updatesB.push(v)}),nonceB=h.nonce();
  h.emit('UPDATE',{nonce:nonceB,text:'B first'});h.emit('UPDATE',{nonce:nonceA,text:'A first'});
  controller.abort();assert.deepEqual(h.port.sent.at(-1),{type:'NATIVE_CANCEL',nonce:nonceA});
  h.emit('UPDATE',{nonce:nonceA,text:'A late'});h.emit('RESULT',{nonce:nonceA,text:'A late'});h.emit('UPDATE',{nonce:nonceB,text:'B second'});
  h.fire(20000);assert.deepEqual(h.port.sent.at(-1),{type:'NATIVE_PING',nonce:nonceB});
  h.emit('CLOSED',{nonce:nonceA});await assert.rejects(a,{code:'CANCELLED'});assert.equal(h.port.onMessage.listeners.size,1);
  h.emit('RESULT',{nonce:nonceB,text:'B done'});assert.equal((await b).text,'B done');assert.deepEqual(updatesA.map(v=>v.text),['A first']);assert.deepEqual(updatesB.map(v=>v.text),['B first','B second']);assertReleased(h);
});

test('blocked provider task gates new work globally while other existing tasks continue and late CLOSED recovers',async()=>{
  const h=harness(),other=port(),updates=[];
  const a=h.run(),nonceA=h.nonce();
  const b=h.run({client:{port:other,tabId:8},onUpdate:v=>updates.push(v)}),nonceB=other.sent[0].nonce;
  h.emit('ERROR',{nonce:nonceA,code:'X_NATIVE_CANCEL_UNCONFIRMED'});await assert.rejects(a,{code:'X_NATIVE_CANCEL_UNCONFIRMED'});
  await assert.rejects(h.run(),{code:'X_NATIVE_CANCEL_UNCONFIRMED'});h.emit('UPDATE',{nonce:nonceB,text:'B continues'},other);assert.equal(updates.length,1);
  h.emit('RESULT',{nonce:nonceB,text:'B done'},other);await b;await assert.rejects(h.run(),{code:'X_NATIVE_CANCEL_UNCONFIRMED'});
  h.emit('CLOSED',{nonce:nonceA});const next=h.run();h.emit('RESULT',{text:'Recovered'});await next;assertReleased(h);assert.equal(other.onMessage.listeners.size,0);
});

test('source disconnect only clears tasks on that source port, including its blocked tasks',async()=>{
  const h=harness(),other=port();const a=h.run(),nonceA=h.nonce();const sameSource=h.run();
  const b=h.run({client:{port:other,tabId:8}}),nonceB=other.sent[0].nonce;
  h.emit('ERROR',{nonce:nonceA,code:'X_NATIVE_CANCEL_UNCONFIRMED'});await assert.rejects(a,{code:'X_NATIVE_CANCEL_UNCONFIRMED'});
  h.port.onDisconnect.emit();await assert.rejects(sameSource,{code:'X_NATIVE_INTERRUPTED'});assert.equal(other.onMessage.listeners.size,1);
  const replacement=h.run();h.emit('RESULT',{text:'Replacement'});await replacement;h.emit('RESULT',{nonce:nonceB,text:'B unaffected'},other);assert.equal((await b).text,'B unaffected');assertReleased(h);
});
