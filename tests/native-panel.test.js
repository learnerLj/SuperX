'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../extension/native-panel.js'),'utf8'),CHANNEL='SUPERX_NATIVE_API_V1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<400;i++){if(fn())return;await sleep(10);}assert.fail('panel condition did not complete');}
function fixture({alreadyOpen=false,draft='',generating=false,initialInert=false,autoReady=true,editorReady=true}={}){
 const listeners=new Map(),windowListeners=new Map(),sent=[],messages=[],timers=[],clicks={open:0,collapse:0,send:0,stop:0,fresh:0},attrs=new Set(initialInert?['inert']:[]);let opened=alreadyOpen;
 const doc={body:{isConnected:true},activeElement:null,addEventListener(n,f){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},removeEventListener(n,f){listeners.get(n)?.delete(f);},emit(n,event={}){for(const f of [...(listeners.get(n)||[])])f(event);},querySelector(s){if(s==='#layers [data-grok-composer]')return opened?composer:null;if(s.includes('GrokDrawerHeader'))return opener;return null;},createElement(){return {remove(){}};}};
 doc.documentElement={attrs:new Set(),setAttribute(n){this.attrs.add(n);},removeAttribute(n){this.attrs.delete(n);},append(){}};
 const reply={isConnected:true,value:'User draft',selectionStart:2,selectionEnd:2,closest(){return null;},focus(o){assert.equal(o.preventScroll,true);doc.activeElement=this;doc.emit('focusin',{target:this});},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}};doc.activeElement=reply;
 let writes=0;const input={isConnected:true,get value(){return draft;},get innerText(){return draft;},set value(v){writes++;draft=v;},closest(){return root;},focus(){if(!attrs.has('inert')){doc.activeElement=this;doc.emit('focusin',{target:this});}},blur(){doc.activeElement=doc.body;}};
 const forbidden=name=>({click(){clicks[name]++;throw new Error('Native '+name+' must not be clicked');}});
 const collapse={click(){clicks.collapse++;opened=false;}};
 const root={isConnected:true,hasAttribute:n=>attrs.has(n),setAttribute(n){attrs.add(n);},removeAttribute(n){attrs.delete(n);},contains:n=>n===input||n===root||n===opener,querySelector(s){if(s.includes('Collapse'))return collapse;if(s.includes('contenteditable'))return editorReady?input:s.includes('textarea')?{value:'',innerText:''}:null;if(s.includes('Stop'))return generating?forbidden('stop'):null;if(s.includes('Send'))return forbidden('send');if(s.includes('New Chat'))return forbidden('fresh');return null;}};
 const composer={closest:()=>root};const opener={isConnected:true,closest:()=>root,click(){clicks.open++;opened=true;setTimeout(()=>{if(opened)input.focus();},10);},blur(){doc.activeElement=doc.body;},focus(){if(!attrs.has('inert')){doc.activeElement=this;doc.emit('focusin',{target:this});}}};
 const view={location:{origin:'https://x.com'},setTimeout(f,ms){if(ms===4000){const t={f,cleared:false};timers.push(t);return t;}return setTimeout(f,ms);},clearTimeout(t){if(t?.f)t.cleared=true;else clearTimeout(t);},setInterval,clearInterval,getSelection:()=>({rangeCount:0}),addEventListener(n,f){if(!windowListeners.has(n))windowListeners.set(n,new Set());windowListeners.get(n).add(f);},removeEventListener(n,f){windowListeners.get(n)?.delete(f);},postMessage(m,origin){assert.equal(origin,'https://x.com');messages.push(m);if(autoReady&&m.type==='CONNECT')queueMicrotask(()=>api('READY',{},m.nonce));}};
 function api(kind,value={},nonce='nonce',overrides={}){const e={source:view,origin:'https://x.com',data:{channel:CHANNEL,direction:'FROM_API',nonce,kind,...value},...overrides};for(const f of [...(windowListeners.get('message')||[])])f(e);}
 const context=vm.createContext({setTimeout,clearTimeout,setInterval,clearInterval});vm.runInContext(source,context);const host=context.SuperXNativePanel.create({document:doc,window:view,send:m=>sent.push(m)});
 return {host,doc,view,root,input,reply,showEditor(){editorReady=true;},sent,messages,clicks,attrs,api,writes:()=>writes,run(nonce='nonce'){host.run({nonce,prompt:'Rule one.\nRule two.'});},fireCancel(){for(const t of timers)if(!t.cleared)t.f();},listenerCount:()=>windowListeners.get('message')?.size||0};
}
test('already-open user panel is entirely untouched, including its draft',()=>{
 const h=fixture({alreadyOpen:true,draft:'My question'});h.run();assert.equal(h.sent.at(-1).code,'X_NATIVE_PANEL_BUSY');assert.equal(h.messages.length,0);assert.equal(h.writes(),0);assert.equal(h.input.value,'My question');assert.equal(h.clicks.open,0);
});
test('raw RUN preserves prompt and never writes the editor or clicks Send/New Chat/Stop',async()=>{
 const h=fixture();h.run();h.run();await until(()=>h.messages.some(m=>m.type==='RUN'));assert.equal(h.messages.filter(m=>m.type==='RUN').length,1);assert.equal(h.messages.find(m=>m.type==='RUN').prompt,'Rule one.\nRule two.');
 assert.equal(h.root.hasAttribute('inert'),true);assert.equal(h.doc.activeElement,h.reply);assert.equal(h.writes(),0);
 h.api('UPDATE',{text:'**Finding**',sources:[]});h.api('RESULT',{text:'**Finding**',sources:[]});await until(()=>h.sent.some(m=>m.kind==='RESULT'));
 assert.deepEqual(h.clicks,{open:1,collapse:1,send:0,stop:0,fresh:0});assert.equal(h.attrs.has('inert'),false);assert.equal(h.doc.activeElement,h.reply);assert.equal(h.reply.value,'User draft');assert.equal(h.reply.selectionStart,2);assert.equal(h.listenerCount(),0);
});
test('bridge events require exact source, origin, channel, direction and nonce',async()=>{
 const h=fixture();h.run();await until(()=>h.messages.some(m=>m.type==='RUN'));
 for(const overrides of [{source:{}},{origin:'https://evil.example'},{data:{channel:'WRONG',direction:'FROM_API',nonce:'nonce',kind:'RESULT'}},{data:{channel:CHANNEL,direction:'TO_API',nonce:'nonce',kind:'RESULT'}}])h.api('RESULT',{text:'Wrong'},'nonce',overrides);
 h.api('RESULT',{text:'Wrong'},'other');assert.equal(h.sent.some(m=>m.kind==='RESULT'),false);assert.equal(h.clicks.collapse,0);
 h.api('RESULT',{text:'Right',sources:[]});await until(()=>h.sent.some(m=>m.kind==='RESULT'));assert.equal(h.sent.at(-1).text,'Right');
});
test('cancellation waits for matching raw CLOSED acknowledgement before releasing',async()=>{
 const h=fixture();h.run();await until(()=>h.messages.some(m=>m.type==='RUN'));h.host.cancel('nonce');assert.equal(h.messages.at(-1).type,'CANCEL');
 h.api('UPDATE',{text:'Late'});h.api('CLOSED',{},'other');await sleep(30);assert.equal(h.sent.some(m=>m.kind==='CLOSED'),false);assert.equal(h.clicks.collapse,0);
 h.api('CLOSED');await until(()=>h.sent.some(m=>m.kind==='CLOSED'));assert.equal(h.clicks.collapse,1);assert.equal(h.writes(),0);assert.equal(h.listenerCount(),0);
});
test('late CLOSED after unconfirmed cancellation safely releases the blocked session',async()=>{
 const h=fixture();h.run();await until(()=>h.messages.some(m=>m.type==='RUN'));h.host.cancel('nonce');h.fireCancel();await until(()=>h.sent.some(m=>m.code==='X_NATIVE_CANCEL_UNCONFIRMED'));
 h.run('next');assert.ok(h.sent.some(m=>m.nonce==='next'&&m.code==='X_NATIVE_CANCEL_UNCONFIRMED'));assert.ok(h.sent.some(m=>m.nonce==='next'&&m.kind==='CLOSED'));h.api('CLOSED');await until(()=>h.sent.some(m=>m.kind==='CLOSED'&&m.nonce==='nonce'));assert.equal(h.listenerCount(),0);
 h.run('next');await until(()=>h.messages.some(m=>m.type==='RUN'&&m.nonce==='next'));h.api('RESULT',{text:'Next',sources:[]},'next');await until(()=>h.sent.some(m=>m.kind==='RESULT'&&m.nonce==='next'));
});
test('trusted user takeover leaves their native panel alone and cancels only raw response',async()=>{
 const h=fixture();h.run();await until(()=>h.messages.some(m=>m.type==='RUN'));h.doc.emit('keydown',{isTrusted:true,target:h.input});assert.equal(h.messages.at(-1).type,'CANCEL');assert.equal(h.attrs.has('inert'),false);
 h.api('CLOSED');await until(()=>h.sent.some(m=>m.kind==='CLOSED'));assert.equal(h.clicks.collapse,0);assert.equal(h.clicks.stop,0);assert.equal(h.clicks.send,0);
});
test('restored user draft or existing generation rejects raw run without any editor action',async()=>{
 for(const options of [{draft:'Unsent user question'},{generating:true}]){
 const h=fixture(options);h.run();await until(()=>h.sent.some(m=>m.kind==='ERROR'));assert.equal(h.sent.at(-1).code,'X_NATIVE_PANEL_BUSY');assert.equal(h.messages.some(m=>m.type==='RUN'),false);assert.equal(h.writes(),0);assert.equal(h.clicks.stop,0);assert.equal(h.clicks.fresh,0);assert.equal(h.input.value,options.draft||'');}
});
test('initial inert state survives completion and raw errors, with no input work',async()=>{
 for(const initialInert of [false,true])for(const kind of ['RESULT','ERROR']){
 const h=fixture({initialInert});h.run();await until(()=>h.messages.some(m=>m.type==='RUN'));h.api(kind,kind==='RESULT'?{text:'Answer',sources:[]}:{code:'X_NATIVE_PAGE_ERROR'});await until(()=>h.sent.some(m=>m.kind===kind));assert.equal(h.attrs.has('inert'),initialInert);assert.equal(h.writes(),0);}
});
test('cancel before bootstrapping cannot later open a panel or send raw RUN',async()=>{
 const h=fixture({autoReady:false});h.run();h.host.cancel('nonce');await until(()=>h.sent.some(m=>m.kind==='CLOSED'));h.api('READY');assert.equal(h.clicks.open,0);assert.equal(h.messages.some(m=>m.type==='RUN'),false);
});

test('cold placeholder textarea is never treated as a ready authenticated composer',async()=>{
 const h=fixture({editorReady:false});h.run();await until(()=>h.clicks.open===1);await sleep(30);
 assert.equal(h.messages.some(m=>m.type==='CONNECT'),false);assert.equal(h.messages.some(m=>m.type==='RUN'),false);
 h.showEditor();await until(()=>h.messages.some(m=>m.type==='RUN'));assert.equal(h.writes(),0);
 h.api('RESULT',{text:'Cold start complete',sources:[]});await until(()=>h.sent.some(m=>m.kind==='RESULT'));assert.equal(h.clicks.collapse,1);
});

test('ten API tasks overlap while UI bootstrap remains serial and an eleventh is refused',async()=>{
 const h=fixture();for(let i=0;i<10;i++)h.run('parallel-'+i);h.run('eleven');assert.equal(h.sent.at(-1).code,'X_NATIVE_PANEL_BUSY');
 for(let i=0;i<10;i++){await until(()=>h.messages.some(m=>m.type==='RUN'&&m.nonce==='parallel-'+i));h.api('RUNNING',{},'parallel-'+i);}
 await until(()=>h.clicks.collapse===10);assert.equal(h.clicks.open,10);assert.equal(h.messages.filter(m=>m.type==='RUN').length,10);
 const collapseCount=h.clicks.collapse;for(let i=9;i>=0;i--)h.api('RESULT',{text:'Answer '+i,sources:[]},'parallel-'+i);
 await until(()=>h.sent.filter(m=>m.kind==='RESULT').length===10);assert.equal(h.clicks.collapse,collapseCount);assert.equal(h.doc.documentElement.attrs.size,0);assert.equal(h.listenerCount(),0);
});
test('late result or cancellation of detached A cannot alter B bootstrap UI',async()=>{
 const h=fixture();h.run('A');h.run('B');await until(()=>h.messages.some(m=>m.type==='RUN'&&m.nonce==='A'));h.api('RUNNING',{},'A');
 await until(()=>h.messages.some(m=>m.type==='RUN'&&m.nonce==='B'));const collapsed=h.clicks.collapse;assert.equal(h.attrs.has('inert'),true);
 h.host.cancel('A');h.api('CLOSED',{},'A');await until(()=>h.sent.some(m=>m.kind==='CLOSED'&&m.nonce==='A'));
 assert.equal(h.clicks.collapse,collapsed);assert.equal(h.attrs.has('inert'),true);assert.ok(h.doc.documentElement.attrs.has('data-superx-native-running'));
 h.api('RESULT',{text:'B survives',sources:[]},'B');await until(()=>h.sent.some(m=>m.kind==='RESULT'&&m.nonce==='B'));assert.equal(h.clicks.collapse,collapsed+1);
});
test('cancel queued bootstrap never opens that panel and fast completion races RUNNING once',async()=>{
 const h=fixture();h.run('A');h.run('B');h.host.cancel('B');await until(()=>h.sent.some(m=>m.kind==='CLOSED'&&m.nonce==='B'));
 await until(()=>h.messages.some(m=>m.type==='RUN'&&m.nonce==='A'));h.api('RESULT',{text:'Fast A',sources:[]},'A');h.api('RUNNING',{},'A');
 await until(()=>h.sent.some(m=>m.kind==='RESULT'&&m.nonce==='A'));assert.equal(h.clicks.open,1);assert.equal(h.clicks.collapse,1);assert.equal(h.messages.some(m=>m.type==='RUN'&&m.nonce==='B'),false);assert.equal(h.sent.filter(m=>m.kind==='RESULT').length,1);
});

test('non-retained global-gate rejection confirms cleanup instead of leaving a phantom blocked task',async()=>{
 const h=fixture();h.run('rejected');await until(()=>h.messages.some(m=>m.type==='RUN'));
 h.api('ERROR',{code:'X_NATIVE_CANCEL_UNCONFIRMED'},'rejected');await until(()=>h.sent.some(m=>m.kind==='CLOSED'&&m.nonce==='rejected'));
 assert.equal(h.sent.filter(m=>m.kind==='ERROR'&&m.nonce==='rejected').length,1);assert.equal(h.listenerCount(),0);
 h.run('next');await until(()=>h.messages.some(m=>m.type==='RUN'&&m.nonce==='next'));h.api('RESULT',{text:'Recovered',sources:[]},'next');await until(()=>h.sent.some(m=>m.kind==='RESULT'&&m.nonce==='next'));
});
