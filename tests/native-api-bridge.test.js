'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../extension/native-api-bridge.js'),'utf8'),Protocol=require('../extension/native-protocol.js'),CHANNEL='SUPERX_NATIVE_API_V1';
const tick=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {resolve,reject,promise};}
function eventTarget(){const events=new Map();return {addEventListener(n,f){if(!events.has(n))events.set(n,new Set());events.get(n).add(f);},removeEventListener(n,f){events.get(n)?.delete(f);},emit(n,event){for(const f of [...(events.get(n)||[])])f(event);},listenerCount:n=>events.get(n)?.size||0};}
function fixture({auth,uid='invented-user /+',formatThrows=false}={}){
 const sockets=[],posted=[],timers=[],opaque={uid,secret:'invented-auth-not-for-messages'},protocols=['invented-opaque-protocol'];let id=0,authCalls=0,formatCalls=0,owned=true,status='idle',draft='';
 const runtime={getCredentials(){authCalls++;return auth?auth.promise:Promise.resolve(opaque);},getTurnStatus:()=>status};
 let composer={__reactFiber$fixture:{memoizedProps:{runtime},return:null}},input={get innerText(){return draft;},closest:()=>composer};
 class Socket{constructor(url,value){Object.assign(this,eventTarget());this.url=url;this.protocols=value;this.readyState=0;this.sent=[];this.closeCalls=0;sockets.push(this);}send(data){if(this.readyState!==1)throw Error('closed');this.sent.push(data);}close(){this.closeCalls++;this.readyState=2;}open(){this.readyState=1;this.emit('open',{});}closed(){this.readyState=3;this.emit('close',{});}frame(data){this.emit('message',{data:typeof data==='string'?data:JSON.stringify(data)});}}
 const originalSend=Socket.prototype.send;
 const view={...eventTarget(),document:{querySelector:()=>owned?input:null},WebSocket:Socket,SuperXNativeProtocol:Protocol,location:{origin:'https://x.com'},crypto:{randomUUID:()=>`id-${++id}`},URL,TextEncoder,setTimeout(f,ms){const timer={f,ms,cleared:false};timers.push(timer);return timer;},clearTimeout(t){if(t)t.cleared=true;},postMessage(m,origin){assert.equal(origin,'https://x.com');posted.push(m);},webpackChunk_twitter_responsive_web:{push(tuple){tuple[2](module=>{assert.equal(module,831216);return {ke(value){formatCalls++;assert.equal(value,opaque);if(formatThrows)throw Error('invented-auth-not-for-messages');return protocols;}};});}}};
 const context=vm.createContext(view);vm.runInContext(source,context);const window=vm.runInContext('globalThis',context);
 function control(type,nonce='nonce',value={},overrides={}){view.emit('message',{source:window,origin:'https://x.com',data:{channel:CHANNEL,direction:'TO_API',type,nonce,...value},...overrides});}
 const packets=socket=>socket.sent.map(x=>JSON.parse(x));
 async function connect(nonce='nonce'){const count=sockets.length;control('PREPARE',nonce);control('CONNECT',nonce);await tick();assert.equal(sockets.length,count+1);return sockets.at(-1);}
 async function start(nonce='nonce'){const s=await connect(nonce);s.open();control('RUN',nonce,{prompt:'Fact check'});return s;}
 function accept(s,session='own-session',response='own-response'){s.session=session;s.response=response;const create=packets(s).find(p=>p.event.type==='session.create');assert.ok(create);s.frame({session_id:session,event:{type:'session.created',client_event_id:create.event.event_id}});s.frame({session_id:session,event:{type:'conversation.attached'}});const request=packets(s).find(p=>p.event.type==='response.create');assert.ok(request);s.frame({session_id:session,event:{type:'response.created',client_event_id:request.event.event_id,response:{id:response,status:'in_progress'}}});return request;}
 const chunk=(s,text,session=s.session||'own-session',response=s.response||'own-response')=>s.frame({session_id:session,event:{type:'response.chunk',response_id:response,chunk:{text:{channel:'CHANNEL_ASSISTANT_RESPONSE',text}}}});
 const done=s=>s.frame({session_id:s.session||'own-session',event:{type:'response.done',response:{id:s.response||'own-response',status:'completed'}}});
 function change(kind){if(kind==='throw')runtime.getTurnStatus=()=>{throw Error('invented-auth-not-for-messages');};if(kind==='draft')draft='User draft';if(kind==='generation')status='working';if(kind==='runtime')composer.__reactFiber$fixture.memoizedProps.runtime={getCredentials:runtime.getCredentials,getTurnStatus:runtime.getTurnStatus};if(kind==='composer')composer={__reactFiber$fixture:{memoizedProps:{runtime},return:null}};if(kind==='input')input={innerText:'',closest:()=>composer};if(kind==='inert')owned=false;}
 return {view,Socket,originalSend,sockets,posted,protocols,opaque,control,packets,connect,start,accept,chunk,done,change,authCalls:()=>authCalls,formatCalls:()=>formatCalls,fireOne(ms,index=0){const t=timers.filter(t=>t.ms===ms&&!t.cleared)[index];assert.ok(t);t.cleared=true;t.f();},fire(ms){for(const t of [...timers])if(t.ms===ms&&!t.cleared){t.cleared=true;t.f();}}};
}
test('cold connect uses fixed gateway with required uid and opaque native formatter; no global socket hooks or credential messages',async()=>{
 const h=fixture();assert.equal(h.Socket.prototype.send,h.originalSend);const s=await h.connect();assert.equal(s.readyState,0);assert.equal(h.posted.some(m=>m.kind==='READY'),false);
 const url=new URL(s.url);assert.equal(url.origin,'wss://grok.com');assert.equal(url.pathname,'/ws/mgw/');assert.equal(url.searchParams.get('uid'),'invented-user /+');assert.deepEqual([...url.searchParams.keys()],['uid']);assert.equal(s.protocols,h.protocols);assert.equal(h.authCalls(),1);assert.equal(h.formatCalls(),1);
 s.open();assert.equal(h.posted.at(-1).kind,'READY');assert.equal(JSON.stringify(h.posted).includes(h.opaque.secret),false);assert.equal(JSON.stringify(h.posted).includes(h.opaque.uid),false);h.control('CANCEL');assert.equal(s.closeCalls,1);s.closed();assert.equal(h.posted.at(-1).kind,'CLOSED');
});
test('cancelled asynchronous authentication cannot open a socket or revive an old nonce',async()=>{
 const auth=deferred(),h=fixture({auth});h.control('PREPARE');h.control('CONNECT');assert.equal(h.authCalls(),1);h.control('CANCEL');assert.equal(h.posted.at(-1).kind,'CLOSED');auth.resolve(h.opaque);await tick();assert.equal(h.sockets.length,0);assert.equal(h.formatCalls(),0);
});
for(const phase of ['after-auth','open','RUN'])test('draft/runtime/composer/input/generation/inert changes at '+phase+' prevent inference',async()=>{
 for(const kind of ['draft','runtime','composer','input','generation','inert']){
 const auth=deferred(),h=fixture({auth});h.control('PREPARE');h.control('CONNECT');
 if(phase==='after-auth')h.change(kind);auth.resolve(h.opaque);await tick();
 if(phase==='after-auth'){assert.equal(h.sockets.length,0);assert.equal(h.posted.at(-1).code,'X_NATIVE_PANEL_BUSY');continue;}
 const s=h.sockets[0];assert.ok(s);if(phase==='open')h.change(kind);s.open();
 if(phase==='RUN'){h.change(kind);h.control('RUN','nonce',{prompt:'Check'});}
 assert.equal(s.sent.length,0);assert.equal(s.closeCalls,1);assert.equal(h.posted.some(m=>m.kind==='RESULT'),false);s.closed();assert.equal(h.posted.at(-1).code,'X_NATIVE_PANEL_BUSY');
 }
});
test('window controls enforce exact source origin channel direction and prepared nonce',async()=>{
 const h=fixture();for(const overrides of [{source:{}},{origin:'https://evil.example'},{data:{channel:'wrong',direction:'TO_API',type:'PREPARE',nonce:'nonce'}},{data:{channel:CHANNEL,direction:'FROM_API',type:'PREPARE',nonce:'nonce'}}])h.control('PREPARE','nonce',{},overrides);
 h.control('CONNECT');await tick();assert.equal(h.sockets.length,0);h.control('PREPARE');h.control('CONNECT','other');await tick();assert.equal(h.sockets.length,0);assert.equal(h.authCalls(),0);
});
test('missing uid or opaque formatter error fails without exposing auth or opening a socket',async()=>{
 for(const options of [{uid:''},{formatThrows:true}]){const h=fixture(options);h.control('PREPARE');h.control('CONNECT');await tick();assert.equal(h.sockets.length,0);assert.equal(h.posted.at(-1).code,'X_NATIVE_UNAVAILABLE');assert.equal(JSON.stringify(h.posted).includes(h.opaque.secret),false);}
});
test('one RUN creates one session and response, filters protocol IDs, and reports result only after actual socket close',async()=>{
 const h=fixture(),s=await h.start();h.control('CONNECT');h.control('RUN','nonce',{prompt:'Duplicate'});assert.equal(h.sockets.length,1);assert.equal(h.packets(s).filter(p=>p.event.type==='session.create').length,1);
 const request=h.accept(s);assert.equal(request.event.item.content[0].text,'Fact check');h.chunk(s,'Wrong session','other');h.chunk(s,'Wrong response','own-session','other');assert.equal(h.posted.some(m=>m.kind==='UPDATE'),false);h.chunk(s,'Our full Markdown **answer**');h.done(s);
 assert.equal(s.closeCalls,1);assert.equal(h.posted.some(m=>m.kind==='RESULT'),false);s.closed();assert.equal(h.posted.at(-1).kind,'RESULT');assert.equal(h.posted.at(-1).text,'Our full Markdown **answer**');assert.equal(s.listenerCount('message'),0);assert.equal(h.packets(s).filter(p=>p.event.type==='response.create').length,1);
});
test('response cancellation and socket close each require their own acknowledgement; late close releases busy gate',async()=>{
 const h=fixture(),s=await h.start();h.accept(s);h.control('CANCEL');assert.equal(h.packets(s).at(-1).event.type,'response.cancel');assert.equal(h.packets(s).at(-1).event.response_id,'own-response');assert.equal(s.closeCalls,0);assert.equal(h.posted.some(m=>m.kind==='CLOSED'),false);
 h.done(s);assert.equal(s.closeCalls,1);assert.equal(h.posted.some(m=>m.kind==='CLOSED'),false);h.fire(4000);assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');h.control('CONNECT','other');assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');s.closed();assert.equal(h.posted.at(-1).kind,'CLOSED');assert.equal(h.sockets.length,1);
});
test('socket open cancellation closes only own connection and waits for actual close',async()=>{
 const h=fixture(),s=await h.connect();h.control('CANCEL');assert.equal(s.closeCalls,1);assert.equal(h.posted.some(m=>m.kind==='CLOSED'),false);s.open();assert.equal(h.posted.some(m=>m.kind==='READY'),false);s.closed();assert.equal(h.posted.at(-1).kind,'CLOSED');assert.equal(s.sent.length,0);
});
test('timeouts close owned transport without replay and retain gate while actual close is missing',async()=>{
 const h=fixture(),s=await h.start();h.accept(s);h.fire(150000);assert.equal(h.packets(s).at(-1).event.type,'response.cancel');h.fire(4000);assert.equal(s.closeCalls,1);h.fire(4000);assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');s.closed();assert.equal(h.sockets.length,1);assert.equal(h.packets(s).filter(p=>p.event.type==='response.create').length,1);
 const pending=fixture();pending.control('PREPARE');pending.fire(30000);assert.equal(pending.posted.at(-1).code,'X_NATIVE_UNAVAILABLE');assert.equal(pending.sockets.length,0);
});

test('native runtime exceptions at connect, open and RUN remain fixed errors without secret rejection',async()=>{
 for(const phase of ['CONNECT','open','RUN']){
  const h=fixture();h.control('PREPARE');if(phase==='CONNECT')h.change('throw');h.control('CONNECT');await tick();
  if(phase==='CONNECT'){assert.equal(h.sockets.length,0);assert.equal(h.posted.at(-1).code,'X_NATIVE_UNAVAILABLE');}
  else {const s=h.sockets[0];if(phase==='open')h.change('throw');assert.doesNotThrow(()=>s.open());if(phase==='RUN'){h.change('throw');assert.doesNotThrow(()=>h.control('RUN','nonce',{prompt:'Check'}));}assert.equal(s.sent.length,0);s.closed();assert.equal(h.posted.at(-1).code,'X_NATIVE_PANEL_BUSY');}
  assert.equal(JSON.stringify(h.posted).includes('invented-auth-not-for-messages'),false);
 }
});

test('MAIN accepts ten independent RUNNING requests; the eleventh waits for a real close, not RUNNING or done',async()=>{
 const h=fixture(),sockets=[];
 for(let i=0;i<10;i++){
  const s=await h.start('task-'+i);h.accept(s,'session-'+i,'response-'+i);sockets.push(s);h.change('input');
 }
 assert.equal(h.sockets.length,10);assert.equal(h.posted.filter(m=>m.kind==='RUNNING').length,10);assert.equal(h.posted.some(m=>m.kind==='RESULT'),false);
 h.control('PREPARE','eleven');assert.equal(h.posted.at(-1).code,'X_NATIVE_BUSY');h.control('CONNECT','eleven');assert.equal(h.posted.at(-1).code,'X_NATIVE_BUSY');assert.equal(h.authCalls(),10);
 h.chunk(sockets[0],'First');h.done(sockets[0]);assert.equal(sockets[0].closeCalls,1);h.control('PREPARE','eleven');assert.equal(h.posted.at(-1).code,'X_NATIVE_BUSY');
 sockets[0].closed();const replacement=await h.start('eleven');h.accept(replacement,'new-session','new-response');assert.equal(h.sockets.length,11);
 // Late callbacks from the disposed socket cannot release the replacement.
 sockets[0].closed();h.control('PREPARE','twelve');assert.equal(h.posted.at(-1).code,'X_NATIVE_BUSY');
 for(let i=9;i>=1;i--){h.chunk(sockets[i],'Answer '+i);h.done(sockets[i]);sockets[i].closed();}
 h.chunk(replacement,'Replacement');h.done(replacement);replacement.closed();
 assert.equal(h.posted.filter(m=>m.kind==='RESULT').length,11);for(const s of h.sockets){assert.equal(s.listenerCount('message'),0);assert.equal(h.packets(s).filter(p=>p.event.type==='session.create').length,1);assert.equal(h.packets(s).filter(p=>p.event.type==='response.create').length,1);}
});

test('RUNNING is sent once after protocol startup, is not terminal, and receive no longer needs bootstrap context',async()=>{
 const h=fixture(),s=await h.start('a');
 assert.equal(h.posted.at(-1).kind,'RUNNING');assert.equal(h.packets(s)[0].event.type,'session.create');h.control('RUN','a',{prompt:'Duplicate'});h.control('CONNECT','a');h.control('PREPARE','a');
 assert.equal(h.sockets.length,1);assert.equal(h.posted.filter(m=>m.kind==='RUNNING').length,1);assert.equal(s.closeCalls,0);
 h.change('inert');h.change('generation');h.accept(s);h.chunk(s,'Answer after panel disappeared');h.done(s);assert.equal(h.posted.some(m=>m.kind==='RESULT'),false);s.closed();assert.equal(h.posted.at(-1).kind,'RESULT');assert.equal(h.posted.at(-1).text,'Answer after panel disappeared');
});

test('interleaved streams and cancellation act only on their own sockets/nonces',async()=>{
 const h=fixture(),a=await h.start('a');h.accept(a,'sa','ra');const b=await h.start('b');h.accept(b,'sb','rb');
 h.chunk(a,'A first');h.chunk(b,'B first');h.chunk(a,'Wrong B frame','sb','rb');h.control('CANCEL','a');
 assert.equal(h.packets(a).at(-1).event.type,'response.cancel');assert.equal(h.packets(b).some(p=>p.event.type==='response.cancel'),false);
 h.chunk(a,'A late');h.chunk(b,' B second');h.done(a);assert.equal(a.closeCalls,1);assert.equal(b.closeCalls,0);a.closed();
 assert.equal(h.posted.at(-1).nonce,'a');assert.equal(h.posted.at(-1).kind,'CLOSED');assert.equal(b.listenerCount('message'),1);
 h.done(b);b.closed();assert.equal(h.posted.at(-1).nonce,'b');assert.equal(h.posted.at(-1).text,'B first B second');
 assert.deepEqual(h.posted.filter(m=>m.kind==='UPDATE'&&m.nonce==='a').map(m=>m.text),['A first']);
});

test('disposing an old response does not clear another nonce PREPARE or its bootstrap timer',async()=>{
 const h=fixture(),a=await h.start('a');h.accept(a,'sa','ra');h.control('PREPARE','b');h.chunk(a,'A done');h.done(a);a.closed();
 h.control('CONNECT','b');await tick();assert.equal(h.sockets.length,2);const b=h.sockets[1];b.open();assert.equal(h.posted.at(-1).kind,'READY');assert.equal(h.posted.at(-1).nonce,'b');
 h.fire(30000);assert.equal(b.closeCalls,1);assert.equal(a.closeCalls,1);b.closed();assert.equal(h.posted.at(-1).code,'X_NATIVE_UNAVAILABLE');assert.equal(h.posted.at(-1).nonce,'b');
});

test('prepared bootstrap remains serial while running protocol does not prevent the next PREPARE',async()=>{
 const h=fixture(),a=await h.start('a');h.control('PREPARE','b');const before=h.posted.length;h.control('PREPARE','c');assert.equal(h.posted.at(-1).code,'X_NATIVE_PANEL_BUSY');assert.equal(h.posted.length,before+1);
 h.control('CANCEL','unknown');assert.equal(h.posted.at(-1).kind,'CLOSED');h.control('CONNECT','b');await tick();assert.equal(h.sockets.length,2);
 const b=h.sockets[1];b.open();h.control('RUN','b',{prompt:'B prompt'});assert.equal(h.posted.at(-1).kind,'RUNNING');h.control('PREPARE','c');h.control('CONNECT','c');await tick();assert.equal(h.sockets.length,3);
 h.control('CANCEL','a');a.closed();h.control('CANCEL','b');b.closed();h.control('CANCEL','c');h.sockets[2].closed();
});

test('a retained cancel error globally gates new PREPARE but other running responses finish; late close restores capacity',async()=>{
 const h=fixture(),a=await h.start('a');h.accept(a,'sa','ra');const b=await h.start('b');h.accept(b,'sb','rb');h.control('CANCEL','a');
 const cancel=h.packets(a).at(-1);a.frame({event:{type:'error',error:{event_id:cancel.event.event_id,message:'PRIVATE ERROR'}}});
 assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');assert.equal(h.posted.at(-1).retain,true);h.control('PREPARE','c');assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');
 h.chunk(b,'B continues');h.done(b);b.closed();assert.equal(h.posted.at(-1).kind,'RESULT');assert.equal(h.posted.at(-1).nonce,'b');h.control('PREPARE','c');assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');
 h.done(a);h.control('PREPARE','c');assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');a.closed();assert.equal(h.posted.at(-1).kind,'CLOSED');assert.equal(h.posted.at(-1).nonce,'a');
 const c=await h.start('c');h.control('CANCEL','c');c.closed();assert.equal(JSON.stringify(h.posted).includes('PRIVATE'),false);
});

test('close timeout retains only its task and later close restores gate even after successful done',async()=>{
 const h=fixture(),a=await h.start('a');h.accept(a);const b=await h.start('b');h.accept(b);
 h.chunk(a,'A finished');h.done(a);h.fire(4000);assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');h.control('PREPARE','c');assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');
 h.chunk(b,'B complete');h.done(b);b.closed();assert.equal(h.posted.at(-1).kind,'RESULT');a.closed();assert.equal(h.posted.at(-1).kind,'CLOSED');
 const c=await h.start('c');h.control('CANCEL','c');c.closed();
});

for(const phase of ['session.create','response.create','response.cancel'])test('send failure '+phase+' blocks new work until real close while other requests continue',async()=>{
 const h=fixture(),b=await h.start('b');h.accept(b,'sb','rb');const a=await h.connect('a');a.open();
 const original=a.send;a.send=function(data){if(JSON.parse(data).event.type===phase)throw Error('invented-auth-not-for-messages');return original.call(this,data);};
 h.control('RUN','a',{prompt:'A prompt'});
 if(phase!=='session.create'){
  if(phase==='response.create'){
   const create=h.packets(a)[0];a.frame({session_id:'sa',event:{type:'session.created',client_event_id:create.event.event_id}});a.frame({session_id:'sa',event:{type:'conversation.attached'}});
  }else{h.accept(a,'sa','ra');h.control('CANCEL','a');}
 }else assert.equal(h.posted.some(m=>m.nonce==='a'&&m.kind==='RUNNING'),false);
 h.control('PREPARE','c');assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');assert.equal(b.closeCalls,0);h.chunk(b,'B good');h.done(b);b.closed();assert.equal(h.posted.at(-1).kind,'RESULT');
 a.closed();assert.equal(a.listenerCount('message'),0);const c=await h.start('c');h.control('CANCEL','c');c.closed();assert.equal(JSON.stringify(h.posted).includes('invented-auth-not-for-messages'),false);
});

test('per-task deadline cancels only its own response; the other task can complete normally',async()=>{
 const h=fixture(),a=await h.start('a');h.accept(a,'sa','ra');const b=await h.start('b');h.accept(b,'sb','rb');h.fireOne(150000);
 assert.equal(h.packets(a).at(-1).event.type,'response.cancel');assert.equal(h.packets(b).some(p=>p.event.type==='response.cancel'),false);
 h.done(a);a.closed();h.chunk(b,'B after A timeout');h.done(b);b.closed();assert.equal(h.posted.at(-1).kind,'RESULT');assert.equal(h.posted.at(-1).nonce,'b');
});

test('late auth for cancelled bootstrap cannot clobber a replacement prepared task while another response runs',async()=>{
 const auth=deferred(),h=fixture({auth});h.control('PREPARE','a');h.control('CONNECT','a');h.control('CONNECT','a');assert.equal(h.authCalls(),1);h.control('CANCEL','a');h.control('PREPARE','b');h.control('CONNECT','b');
 auth.resolve(h.opaque);await tick();assert.equal(h.sockets.length,1);const b=h.sockets[0];b.open();h.control('RUN','b',{prompt:'B only'});assert.equal(h.posted.at(-1).kind,'RUNNING');assert.equal(h.posted.at(-1).nonce,'b');h.control('CANCEL','b');b.closed();
});

test('pagehide cancels each owned socket and clears only the current bootstrap',async()=>{
 const h=fixture(),a=await h.start('a');h.accept(a,'sa','ra');const b=await h.start('b');h.accept(b,'sb','rb');h.control('PREPARE','c');h.view.emit('pagehide',{});
 for(const s of [a,b]){assert.equal(h.packets(s).at(-1).event.type,'response.cancel');h.done(s);s.closed();assert.equal(s.listenerCount('message'),0);}
 h.control('CONNECT','c');await tick();assert.equal(h.sockets.length,2);assert.equal(h.posted.at(-1).code,'X_NATIVE_UNAVAILABLE');
});

for(const phase of ['after-auth','open','RUN'])test('global unconfirmed gate is rechecked at '+phase+' without starting a prepared response',async()=>{
 const auth=deferred(),h=fixture({auth});auth.resolve(h.opaque);const a=await h.start('A');h.accept(a,'sa','ra');
 const next=deferred();auth.promise=next.promise;h.control('PREPARE','B');h.control('CONNECT','B');
 if(phase!=='after-auth'){next.resolve(h.opaque);await tick();if(phase==='RUN')h.sockets[1].open();}
 h.chunk(a,'Completed A');h.done(a);h.fire(4000);assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');
 if(phase==='after-auth'){next.resolve(h.opaque);await tick();assert.equal(h.sockets.length,1);}
 else {const b=h.sockets[1];if(phase==='open')b.open();else h.control('RUN','B',{prompt:'Must not start'});assert.equal(b.sent.length,0);b.closed();}
 assert.equal(h.posted.at(-1).nonce,'B');assert.equal(h.posted.at(-1).code,'X_NATIVE_CANCEL_UNCONFIRMED');assert.notEqual(h.posted.at(-1).retain,true);
 a.closed();const c=await h.start('C');h.control('CANCEL','C');c.closed();
});
