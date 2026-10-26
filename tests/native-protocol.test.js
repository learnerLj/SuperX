'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Protocol=require('../extension/native-protocol.js');
const PROMPT='Check **this** post.\n原始 Markdown 不应被转换。';
function harness(options={}){
  const sent=[],events=[];let counter=0;
  const api=Protocol.create({nonce:'outer-nonce',prompt:PROMPT,randomUUID:()=>`id-${++counter}`,
    send(value){sent.push(structuredClone(value));options.send?.(value);},emit(value){events.push(value);}});
  const createId=()=>sent.find(m=>m.event.type==='session.create')?.event.event_id;
  const requestId=()=>sent.find(m=>m.event.type==='response.create')?.event.event_id;
  const cancelId=()=>sent.find(m=>m.event.type==='response.cancel')?.event.event_id;
  const receive=(type,extra={},session='session-own')=>api.receive({session_id:session,event:{type,...extra}});
  const session=()=>receive('session.created',{client_event_id:createId(),session:{model:'fast',x_grok:{}}});
  const attach=()=>receive('conversation.attached');
  const response=()=>receive('response.created',{client_event_id:requestId(),response:{id:'response-own',status:'in_progress'}});
  const chunk=(value,responseId='response-own',sessionId='session-own')=>receive('response.chunk',{response_id:responseId,chunk:value},sessionId);
  const text=(delta,channel='CHANNEL_ASSISTANT_RESPONSE')=>chunk({text:{channel,text:delta}});
  const citation=url=>chunk({metadata:{untrusted:'unused'},render_citation:{citation_id:1,id:'5db08a',kind:'CITATION_KIND_WEB_PAGE',url}});
  const done=(status='completed',responseId='response-own',sessionId='session-own')=>receive('response.done',{response:{id:responseId,status}},sessionId);
  const error=eventId=>api.receive({event:{type:'error',error:{type:'invalid_request_error',code:'unknown_session',message:'SECRET SERVER MESSAGE',event_id:eventId}}});
  const ready=()=>{api.start();session();attach();response();};
  const terminalEvents=()=>events.filter(event=>event.kind!=='UPDATE'&&!event.retain);
  return {api,sent,events,receive,session,attach,response,chunk,text,citation,done,error,ready,createId,requestId,cancelId,terminalEvents};
}
function assertTerminal(h,event){assert.equal(h.api.isTerminal(),true);assert.deepEqual(h.terminalEvents(),[event]);}

test('UMD exposes the same create API without a CommonJS or DOM dependency',()=>{
  const context=vm.createContext({URL,TextEncoder});vm.runInContext(fs.readFileSync(require.resolve('../extension/native-protocol.js'),'utf8'),context);
  assert.equal(typeof context.SuperXNativeProtocol.create,'function');assert.deepEqual(Object.keys(Protocol),['create']);
});

test('exact Fast session and response envelopes are single-send; completed returns unchanged Markdown',()=>{
  const h=harness();h.api.start();h.api.start();
  assert.deepEqual(h.sent,[{event:{type:'session.create',event_id:'id-1',session:{model:'fast',x_grok:{protocol_capabilities:['conversation_attached','custom_methods_v1','workspace_servers_v1'],use_chunk:true,disable_artifact:true,accept_interleaved_phases:true,disabled_connector_ids:[]}}}}]);
  h.session();assert.equal(h.sent.length,1);h.attach();h.attach();h.session();
  assert.deepEqual(h.sent[1],{session_id:'session-own',event:{type:'response.create',event_id:'id-2',item:{type:'message',role:'user',content:[{type:'input_text',text:PROMPT}],x_grok:{client_message_id:'id-3'}}}});
  h.response();const markdown='## Evidence\n\n**bold** and _emphasis_\n\n- item\n\n```js\nx = 1;\n```\n';
  h.text(markdown.slice(0,20));h.text(markdown.slice(20));assert.equal(h.api.isTerminal(),false);assert.equal(h.events.at(-1).text,markdown);
  h.done();assertTerminal(h,{kind:'RESULT',text:markdown,sources:[]});assert.equal(h.sent.length,2);
});

test('wrong create, session, response and old attached events never bind or submit',()=>{
  const h=harness();h.api.start();
  h.receive('session.created',{client_event_id:'wrong',session:{model:'fast'}},'old-session');h.attach();assert.equal(h.sent.length,1);
  h.session();h.receive('conversation.attached',{},'old-session');assert.equal(h.sent.length,1);h.attach();
  h.receive('session.created',{client_event_id:h.createId(),session:{}},'replacement');h.receive('conversation.attached',{},'replacement');
  h.response();h.chunk({text:{channel:'CHANNEL_ASSISTANT_RESPONSE',text:'Other session'}},'response-own','old-session');h.chunk({text:{channel:'CHANNEL_ASSISTANT_RESPONSE',text:'Other response'}},'old-response');h.done('completed','response-own','old-session');h.done('completed','old-response');
  assert.deepEqual(h.events,[]);h.text('Own answer');h.done();assertTerminal(h,{kind:'RESULT',text:'Own answer',sources:[]});assert.equal(h.sent.length,2);
});

test('response.created strictly matches request and session and never binds from chunks/done',()=>{
  const h=harness();h.api.start();h.session();h.attach();
  h.receive('response.created',{client_event_id:'wrong',response:{id:'response-own',status:'in_progress'}});
  h.receive('response.created',{client_event_id:h.requestId(),response:{id:'response-own',status:'in_progress'}},'wrong-session');
  h.receive('response.created',{client_event_id:h.requestId(),response:{id:'response-own',status:'completed'}});
  h.text('Unbound');h.done();assert.deepEqual(h.events,[]);assert.equal(h.api.isTerminal(),false);
  h.response();h.receive('response.created',{client_event_id:h.requestId(),response:{id:'replacement',status:'in_progress'}});h.chunk({text:{channel:'CHANNEL_ASSISTANT_RESPONSE',text:'Wrong'}},'replacement');
  h.text('Bound');h.done();assertTerminal(h,{kind:'RESULT',text:'Bound',sources:[]});
});

test('notetaker, analysis, tool_result and ui_layout never enter output or sources',()=>{
  const h=harness();h.ready();
  for(const channel of ['CHANNEL_NOTETAKER','CHANNEL_ASSISTANT_ANALYSIS','analysis','NOTETAKER',undefined])h.chunk({text:{channel,text:'PRIVATE REASONING'},render_citation:{url:'https://private.example'}});
  h.chunk({tool_result:{text:'PRIVATE TOOL'},ui_layout:{text:'PRIVATE UI'}});h.receive('response.output_item.done',{response_id:'response-own',item:{content:[{text:'PRIVATE'}]}});
  assert.deepEqual(h.events,[]);h.text('Public');h.done();assertTerminal(h,{kind:'RESULT',text:'Public',sources:[]});assert.equal(JSON.stringify(h.events).includes('PRIVATE'),false);
});

test('empty output_text.done and output_item.done never clear assistant deltas or replace them',()=>{
  const h=harness();h.ready();h.text('**Raw Markdown**');
  h.receive('response.output_text.done',{response_id:'response-own',text:''});h.receive('response.output_item.done',{response_id:'response-own',content:{text:''}});
  h.receive('response.output_text.done',{response_id:'response-own',text:'REPLACEMENT'});h.done();assertTerminal(h,{kind:'RESULT',text:'**Raw Markdown**',sources:[]});
});

test('repeated done, late chunks, cancel, disconnect and start cannot emit another terminal or resend',()=>{
  const h=harness();h.ready();h.text('Final');h.done();const events=structuredClone(h.events),sent=structuredClone(h.sent);
  h.done();h.done('incomplete');h.text('Late');h.citation('https://late.example');h.api.cancel();h.api.disconnect();h.api.start();h.error(h.requestId());
  assert.deepEqual(h.events,events);assert.deepEqual(h.sent,sent);assertTerminal(h,{kind:'RESULT',text:'Final',sources:[]});
});

for(const stage of ['before-start','before-session','before-attached'])test('cancel '+stage+' closes without submitting response.create',()=>{
  const h=harness();if(stage!=='before-start')h.api.start();if(stage==='before-attached')h.session();h.api.cancel();h.api.cancel();h.session();h.attach();h.api.start();
  assertTerminal(h,{kind:'CLOSED'});assert.equal(h.sent.some(m=>m.event.type==='response.create'),false);assert.equal(h.sent.some(m=>m.event.type==='response.cancel'),false);
});

test('cancel after response.create waits for matching response.created then sends one exact cancel',()=>{
  const h=harness();h.api.start();h.session();h.attach();h.api.cancel();h.api.cancel();assert.equal(h.api.isTerminal(),false);assert.deepEqual(h.events,[]);assert.equal(h.sent.length,2);
  h.receive('response.created',{client_event_id:'wrong',response:{id:'response-own',status:'in_progress'}});assert.equal(h.sent.length,2);
  h.response();h.response();h.api.cancel();assert.deepEqual(h.sent[2],{session_id:'session-own',event:{type:'response.cancel',event_id:'id-4',response_id:'response-own'}});assert.equal(h.sent.length,3);
  h.text('Late');h.done('incomplete');assertTerminal(h,{kind:'CLOSED'});
});

for(const status of ['completed','incomplete','failed'])test('bound cancellation ignores chunks and waits for own done '+status,()=>{
  const h=harness();h.ready();h.text('Before cancel');h.api.cancel();h.api.cancel();assert.equal(h.api.isTerminal(),false);const events=structuredClone(h.events);
  h.text('After cancel');h.done(status,'other');h.done(status,'response-own','other');assert.deepEqual(h.events,events);h.done(status);assertTerminal(h,{kind:'CLOSED'});assert.equal(h.sent.filter(m=>m.event.type==='response.cancel').length,1);
});

test('completion wins if it arrived before cancel; cancel wins if it arrived before completion',()=>{
  const completed=harness();completed.ready();completed.text('Done');completed.done();completed.api.cancel();assert.equal(completed.sent.length,2);assertTerminal(completed,{kind:'RESULT',text:'Done',sources:[]});
  const cancelled=harness();cancelled.ready();cancelled.text('Done');cancelled.api.cancel();cancelled.done();assertTerminal(cancelled,{kind:'CLOSED'});
});

test('cancel error retains nonterminal gate and a later matching done confirms closure',()=>{
  const h=harness();h.ready();h.api.cancel();h.error('wrong');assert.deepEqual(h.events,[]);h.error(h.cancelId());h.error(h.cancelId());
  assert.equal(h.api.isTerminal(),false);assert.deepEqual(h.events,[{kind:'ERROR',code:'X_NATIVE_CANCEL_UNCONFIRMED',retain:true}]);h.text('Late');h.api.start();h.api.cancel();assert.equal(h.sent.length,3);
  h.done('incomplete');assertTerminal(h,{kind:'CLOSED'});assert.equal(JSON.stringify(h.events).includes('SECRET'),false);
});

test('cancel rejection can also recover when socket actually disconnects',()=>{
  const h=harness();h.ready();h.api.cancel();h.error(h.cancelId());assert.equal(h.api.isTerminal(),false);h.api.disconnect();assertTerminal(h,{kind:'CLOSED'});
});

for(const pending of ['create','response','bound'])test('disconnect '+pending+' reports fixed interruption exactly once',()=>{
  const h=harness();h.api.start();if(pending!=='create'){h.session();h.attach();}if(pending==='bound')h.response();h.api.disconnect();h.api.disconnect();h.api.start();h.response();h.done();assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_INTERRUPTED'});
});

test('disconnect during pending response cancellation closes without requiring a created event',()=>{
  const h=harness();h.api.start();h.session();h.attach();h.api.cancel();h.api.disconnect();assertTerminal(h,{kind:'CLOSED'});assert.equal(h.sent.length,2);
});

for(const phase of ['create','request'])test('only associated '+phase+' rejection may end an ungenerated request without raw server messages',()=>{
  const h=harness();h.api.start();if(phase==='request'){h.session();h.attach();}h.error('not-our-id');assert.deepEqual(h.events,[]);h.error(phase==='create'?h.createId():h.requestId());assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_PAGE_ERROR'});assert.equal(JSON.stringify(h.events).includes('SECRET'),false);
});

test('pending cancellation plus a request rejection is CLOSED; late request errors cannot terminate a bound response',()=>{
  const h=harness();h.api.start();h.session();h.attach();h.api.cancel();h.error(h.requestId());assertTerminal(h,{kind:'CLOSED'});
  const bound=harness();bound.ready();bound.error(bound.createId());bound.error(bound.requestId());assert.equal(bound.api.isTerminal(),false);bound.text('Actual answer');bound.done();assertTerminal(bound,{kind:'RESULT',text:'Actual answer',sources:[]});
});

for(const [status,text,code] of [['completed','','X_NATIVE_PAGE_ERROR'],['completed',' \n\t','X_NATIVE_PAGE_ERROR'],['incomplete','Partial','X_NATIVE_INTERRUPTED'],['failed','Partial','X_NATIVE_PAGE_ERROR']])test('done '+status+' '+JSON.stringify(text)+' cannot masquerade as a successful answer',()=>{
  const h=harness();h.ready();h.text(text);h.done(status);assertTerminal(h,{kind:'ERROR',code});
});

test('citations append at the current Markdown position, reuse URL numbers and keep first-source order',()=>{
  const h=harness();h.ready();h.text('Earth');h.citation('https://science.nasa.gov/earth/facts/');h.text(' and Moon');h.citation('http://moon.example/facts');h.text(' again');h.citation('https://science.nasa.gov/earth/facts/');h.done();
  assertTerminal(h,{kind:'RESULT',text:'Earth[[1]](<https://science.nasa.gov/earth/facts/>) and Moon[[2]](<http://moon.example/facts>) again[[1]](<https://science.nasa.gov/earth/facts/>)',sources:[{url:'https://science.nasa.gov/earth/facts/',title:'science.nasa.gov'},{url:'http://moon.example/facts',title:'moon.example'}]});
});

test('a text and citation in one chunk preserve their order; emitted source snapshots cannot mutate state',()=>{
  const h=harness();h.ready();h.chunk({text:{channel:'CHANNEL_ASSISTANT_RESPONSE',text:'Answer '},render_citation:{url:'https://example.com'}});
  h.events[0].sources[0].title='MUTATED';h.events[0].sources.push({url:'https://fake.example'});h.done();assertTerminal(h,{kind:'RESULT',text:'Answer [[1]](<https://example.com/>)',sources:[{url:'https://example.com/',title:'example.com'}]});
});

for(const url of [undefined,'','javascript:alert(1)','data:text/html,hello','ftp://example.com/file','https://user:secret@example.com','https://example.com/'+ 'a'.repeat(2048)])test('explicit unsafe or absent citation '+String(url).slice(0,40)+' cancels and only errors after done',()=>{
  const h=harness();h.ready();h.text('Partial');h.citation(url);assert.equal(h.api.isTerminal(),false);assert.equal(h.sent.at(-1).event.type,'response.cancel');assert.equal(h.terminalEvents().length,0);
  const before=structuredClone(h.events);h.text('Late');h.citation('https://safe.example');assert.deepEqual(h.events,before);h.done('incomplete');assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_CITATION_UNAVAILABLE'});assert.equal(h.sent.filter(m=>m.event.type==='response.cancel').length,1);
});

test('explicit null citation cannot silently succeed; completed after internal cancel still errors',()=>{
  const h=harness();h.ready();h.text('Partial');h.chunk({render_citation:null});h.api.cancel();h.done('completed');assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_CITATION_UNAVAILABLE'});
});

test('20 sources allow duplicate citations but the 21st unique URL cancels instead of dropping it',()=>{
  const h=harness();h.ready();for(let i=0;i<20;i++)h.citation('https://example.com/'+i);h.citation('https://example.com/0');assert.equal(h.sent.length,2);assert.equal(h.events.at(-1).sources.length,20);
  h.citation('https://example.com/20');assert.equal(h.sent.length,3);h.done();assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_CITATION_UNAVAILABLE'});
});

for(const suffix of ['x','citation'])test('30000-character body including '+suffix+' cannot silently truncate to success',()=>{
  const h=harness();h.ready();h.text('x'.repeat(30000));assert.equal(h.events.at(-1).text.length,30000);
  if(suffix==='citation')h.citation('https://example.com');else h.text('x');assert.equal(h.api.isTerminal(),false);assert.equal(h.sent.at(-1).event.type,'response.cancel');h.done('completed');assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_RESPONSE_LIMIT'});
});

test('an exactly 30000-character response completes without truncation',()=>{
  const h=harness();h.ready();const body='x'.repeat(30000);h.text(body);h.done();assertTerminal(h,{kind:'RESULT',text:body,sources:[]});assert.equal(h.sent.length,2);
});

for(const phase of ['before-response','pending-response','bound-response'])test('oversize raw frame '+phase+' safely fails/cancels without parsing or displaying it',()=>{
  const h=harness();h.api.start();if(phase!=='before-response'){h.session();h.attach();}if(phase==='bound-response')h.response();
  h.api.receive(' '.repeat(2*1024*1024+1));
  if(phase==='before-response')assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_RESPONSE_LIMIT'});
  else{assert.equal(h.api.isTerminal(),false);if(phase==='pending-response')h.response();assert.equal(h.sent.at(-1).event.type,'response.cancel');h.done('incomplete');assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_RESPONSE_LIMIT'});}
});

test('UTF-8 frame bytes count toward the 2MB budget',()=>{
  const h=harness();h.ready();h.api.receive('中'.repeat(800000));assert.equal(h.sent.at(-1).event.type,'response.cancel');h.done('incomplete');assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_RESPONSE_LIMIT'});
});

test('malformed JSON and non-plain envelopes are ignored; JSON strings are otherwise accepted',()=>{
  const h=harness();h.api.start();for(const data of ['{','[]','null','1','"hi"',null,undefined,42,[],new Date(),new (class Envelope{})(),{event:[]},{event:null}])h.api.receive(data);
  assert.deepEqual(h.events,[]);h.api.receive(JSON.stringify({session_id:'session-own',event:{type:'session.created',client_event_id:h.createId()}}));h.attach();h.response();h.api.receive(JSON.stringify({session_id:'session-own',event:{type:'response.chunk',response_id:'response-own',chunk:{text:{channel:'CHANNEL_ASSISTANT_RESPONSE',text:'String frame'}}}}));h.done();assertTerminal(h,{kind:'RESULT',text:'String frame',sources:[]});
});

for(const value of ['', ' ', 'x'.repeat(201),123])test('invalid server identifier '+String(value).slice(0,10)+' cannot bind session or response',()=>{
  const h=harness();h.api.start();h.receive('session.created',{client_event_id:h.createId()},value);h.attach();assert.equal(h.sent.length,1);h.session();h.attach();h.receive('response.created',{client_event_id:h.requestId(),response:{id:value,status:'in_progress'}});h.text('Unbound');assert.deepEqual(h.events,[]);h.response();h.text('Valid');h.done();assertTerminal(h,{kind:'RESULT',text:'Valid',sources:[]});
});

for(const failOn of ['session.create','response.create','response.cancel'])test('send throw on '+failOn+' never confirms a possibly running response or replays',()=>{
  const h=harness({send(message){if(message.event.type===failOn)throw new Error('SECRET TRANSPORT');}});h.api.start();if(failOn!=='session.create'){h.session();h.attach();}if(failOn==='response.cancel'){h.response();h.api.cancel();}
  if(failOn==='session.create')assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_INTERRUPTED'});
  else {
    assert.equal(h.api.isTerminal(),false);assert.deepEqual(h.events,[{kind:'ERROR',code:'X_NATIVE_CANCEL_UNCONFIRMED',retain:true}]);
    h.api.disconnect();assertTerminal(h,{kind:'CLOSED'});
  }
  const count=h.sent.length;h.api.start();h.attach();h.api.cancel();h.response();assert.equal(h.sent.length,count);assert.equal(JSON.stringify(h.events).includes('SECRET'),false);
});
test('explicit non-Fast model acknowledgement never submits a response',()=>{
 const h=harness();h.api.start();h.receive('session.created',{client_event_id:h.createId(),session:{model:'auto'}});h.attach();assert.equal(h.sent.length,1);assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_PAGE_ERROR'});
});

test('invalid generated IDs reject before submission, but cannot falsely close an already-created response',()=>{
  for(const invalidAt of [1,2,3,4]){
    const sent=[],events=[];let count=0;
    const api=Protocol.create({nonce:'n',prompt:'p',randomUUID:()=>++count===invalidAt?'x'.repeat(201):'id-'+count,send:value=>sent.push(value),emit:value=>events.push(value)});
    api.start();if(invalidAt>1){api.receive({session_id:'s',event:{type:'session.created',client_event_id:'id-1'}});api.receive({session_id:'s',event:{type:'conversation.attached'}});}
    if(invalidAt===4){
      api.receive({session_id:'s',event:{type:'response.created',client_event_id:'id-2',response:{id:'r',status:'in_progress'}}});api.cancel();api.cancel();
      assert.equal(api.isTerminal(),false);assert.deepEqual(events,[{kind:'ERROR',code:'X_NATIVE_CANCEL_UNCONFIRMED',retain:true}]);assert.equal(sent.length,2);
      api.receive({session_id:'s',event:{type:'response.done',response:{id:'r',status:'incomplete'}}});assert.deepEqual(events.at(-1),{kind:'CLOSED'});
    }else{assert.deepEqual(events,[{kind:'ERROR',code:'X_NATIVE_PAGE_ERROR'}]);assert.equal(sent.length,invalidAt===1?0:1);}
    assert.equal(api.isTerminal(),true);
  }
});

test('throwing ID generator produces a fixed error without transport calls',()=>{
  const sent=[],events=[];const api=Protocol.create({nonce:'n',prompt:'p',send:v=>sent.push(v),emit:v=>events.push(v),randomUUID(){throw new Error('SECRET');}});api.start();api.start();assert.deepEqual(sent,[]);assert.deepEqual(events,[{kind:'ERROR',code:'X_NATIVE_PAGE_ERROR'}]);assert.equal(api.isTerminal(),true);
});

test('cancel rejection after an internal citation error retains state until terminal internal error',()=>{
  const h=harness();h.ready();h.citation(undefined);h.error(h.cancelId());assert.equal(h.api.isTerminal(),false);assert.deepEqual(h.events,[{kind:'ERROR',code:'X_NATIVE_CANCEL_UNCONFIRMED',retain:true}]);h.done('incomplete');assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_CITATION_UNAVAILABLE'});
});

test('a raw-short Unicode URL that expands beyond the source URL budget also cancels',()=>{
  const h=harness();h.ready();h.citation('https://example.com/'+'中'.repeat(300));assert.equal(h.sent.at(-1).event.type,'response.cancel');h.done('incomplete');assertTerminal(h,{kind:'ERROR',code:'X_NATIVE_CITATION_UNAVAILABLE'});
});
