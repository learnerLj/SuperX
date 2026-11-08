'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const history = require('../extension/history.js');
const core = require('../extension/feed-core.js');
const ui = require('../extension/ui-i18n.js');
const markdown = require('../extension/markdown-renderer.js');

// No HTML parser or user profile is available to this fixture. Unsafe HTML
// sinks throw, so untrusted saved posts and model responses must stay inert.
class Node {
  constructor(document,tag = '',text = '') {
    this.ownerDocument = document;this.tagName = tag.toUpperCase();this.nodeType = tag ? 1 : 3;this.text = text;this.value = '';
    this.childNodes = [];this.attributes = new Map();this.dataset = {};this.events = new Map();this.hidden = false;this.disabled = false;this.checked = false;
    this.style = {};
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.nodeType === 11) this.append(...node.childNodes);
      else {const child = typeof node === 'string' ? this.ownerDocument.createTextNode(node) : node;child.parentNode = this;this.childNodes.push(child);}
    }
  }
  appendChild(node) {this.append(node);return node;}
  insertBefore(node,reference) {
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = reference === null ? this.childNodes.length : this.childNodes.indexOf(reference);
    if (index < 0) throw new Error('Unknown insertion reference');this.childNodes.splice(index,0,node);node.parentNode = this;return node;
  }
  removeChild(node) {const index = this.childNodes.indexOf(node);if (index < 0) throw new Error('Unknown child');this.childNodes.splice(index,1);node.parentNode = null;return node;}
  contains(node) {return node === this || descendants(this).includes(node);}
  replaceChildren(...nodes) {this.childNodes = [];this.text = '';this.append(...nodes);}
  setAttribute(name,value) {this.attributes.set(name,String(value));}
  getAttribute(name) {return this.attributes.get(name) ?? null;}
  matches(selector) {return selector.split(',').some(part => {const match = part.trim().match(/^(?:([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/);return match && (!match[1] || this.tagName === match[1].toUpperCase()) && (!match[2] || this.attributes.has(match[2]) && (match[3] === undefined || this.getAttribute(match[2]) === match[3]));});}
  querySelectorAll(selector) {return descendants(this).filter(node => node.nodeType === 1 && node.matches(selector));}
  addEventListener(type,listener) {const list = this.events.get(type) || [];list.push(listener);this.events.set(type,list);}
  async trigger(type,event = {}) {for (const listener of this.events.get(type) || []) await listener({target:this,...event});}
  focus() {this.ownerDocument.activeElement = this;}
  get textContent() {return this.text + this.childNodes.map(node => node.textContent).join('');}
  set textContent(value) {this.childNodes = [];this.text = String(value);}
  set innerHTML(value) {throw new Error('Unsafe innerHTML: ' + value);}
  set outerHTML(value) {throw new Error('Unsafe outerHTML: ' + value);}
  insertAdjacentHTML() {throw new Error('Unsafe HTML insertion');}
}
function descendants(node) {return node.childNodes.flatMap(child => [child,...descendants(child)]);}
function nodes(node,tag) {return descendants(node).filter(child => child.nodeType === 1 && (!tag || child.tagName === tag.toUpperCase()));}
const current = 1791320000000,MB = 1024 * 1024;
const answer = (overrides = {}) => ({index:0,provider:'api',account:'',model:'grok-4.3',language:'en',completedAt:current - 5000,text:'**Saved answer**',sources:[],verificationStatus:'completed',usageComplete:true,...overrides});
const record = (id = '1',overrides = {}) => ({id,url:`https://x.com/test/status/${id}`,hasSnapshot:true,author:'Test · @test',text:'Visible post text',activityAt:current - Number(id),preferred:0,answers:[answer()],comments:[],...overrides});
const deferred = () => {let resolve;const promise = new Promise(done => {resolve = done;});return {promise,resolve};};
const settle = async () => {for (let index = 0;index < 8;index++) await new Promise(resolve => setImmediate(resolve));};
const searchable = item => [item.text,item.author,item.url,...item.answers.map(value => value.text),...item.comments].join('\n').toLocaleLowerCase();
const newestFirst = (a,b) => b.activityAt - a.activityAt || (BigInt(b.id) > BigInt(a.id) ? 1 : -1);
const before = (item,cursor) => item.activityAt < cursor[0] || item.activityAt === cursor[0] && BigInt(item.id) < BigInt(cursor[1]);

/** Mirrors the worker's GET_RECORDS / GET_CACHE_USAGE contract. */
function fixture({records = [record()],send,locale = 'en',interfaceLanguage = 'auto',pageSize = 50,usedBytes = 10 * MB,limitBytes = 1024 * MB} = {}) {
  const created = [],ids = new Map(),document = {
    title:'',activeElement:null,
    createElement(tag) {const node = new Node(document,tag);created.push(node);return node;},
    createTextNode(text) {return new Node(document,'',String(text));},
    createDocumentFragment() {const node = new Node(document);node.nodeType = 11;return node;},
    getElementById(id) {return ids.get(id);},
    querySelectorAll(selector) {return document.documentElement.querySelectorAll(selector);},
    addEventListener(type,listener) {document.documentElement.addEventListener(type,listener);},
  };
  document.documentElement = document.createElement('html');document.body = document.createElement('body');document.documentElement.append(document.body);
  const tags = {'history-search':'input','history-status':'p','usage':'div','usage-meter':'div','usage-fill':'span','usage-text':'p','usage-hint':'p','history-empty':'div','empty-title':'h2','empty-help':'p','history-list':'section','clear-confirmation':'section','history-more':'div'};
  for (const id of ['clear-history','history-status','usage','usage-meter','usage-fill','usage-text','usage-hint','refresh-history','history-search','new-records','history-empty','empty-title','empty-help','history-list','clear-confirmation','confirm-clear','cancel-clear','history-more','more-history']) {
    const element = document.createElement(tags[id] || 'button');element.id = id;element.setAttribute('id',id);ids.set(id,element);document.body.append(element);
  }
  ids.get('clear-confirmation').hidden = true;ids.get('usage').hidden = true;ids.get('usage-hint').hidden = true;ids.get('new-records').hidden = true;
  ids.get('history-search').setAttribute('data-i18n-placeholder','history.search');
  const heading = document.createElement('h1');heading.setAttribute('data-i18n','history.title');document.body.append(heading);
  const state = {records:structuredClone(records),epoch:0,usedBytes,limitBytes};
  let timerId = 0;
  const calls = [],runtimeListeners = [],storageListeners = [],timers = new Map(),copies = [];
  const chrome = {
    runtime:{onMessage:{addListener:fn => runtimeListeners.push(fn)},async sendMessage(message) {
      calls.push(structuredClone(message));
      const intercepted = send ? await send(message,state) : undefined;if (intercepted !== undefined) return intercepted;
      if (message.type === 'GET_CONFIG') return {ok:true,ready:false,settings:core.normalizeSettings({interfaceLanguage})};
      if (message.type === 'GET_UI_LANGUAGE') return {ok:true,language:locale};
      if (message.type === 'GET_RECORDS') {
        const needle = (message.query || '').toLocaleLowerCase();
        const items = state.records.filter(item => (!message.after || before(item,message.after)) && (!needle || searchable(item).includes(needle))).sort(newestFirst);
        const page = items.slice(0,pageSize),last = page[page.length - 1];
        return structuredClone({ok:true,epoch:state.epoch,records:page,next:items.length > pageSize ? [last.activityAt,last.id] : null});
      }
      if (message.type === 'GET_CACHE_USAGE') return {ok:true,epoch:state.epoch,limitBytes:state.limitBytes,bytes:state.usedBytes,records:state.records.length,answers:state.records.reduce((sum,item) => sum + item.answers.length,0)};
      if (message.type === 'DELETE_HISTORY') {state.records = state.records.filter(item => item.id !== message.id);state.epoch++;return {ok:true,epoch:state.epoch};}
      if (message.type === 'CLEAR_HISTORY') {state.records = [];state.usedBytes = 0;state.epoch++;return {ok:true,epoch:state.epoch};}
      return {ok:false};
    }},
    storage:{local:{async get() {return {uiLanguage:locale};}},onChanged:{addListener:fn => storageListeners.push(fn)}},
  };
  const environment = {document,chrome,XGrokCore:core,GrokFirstUI:ui,GrokFirstMarkdown:markdown,
    navigator:{language:locale,clipboard:{async writeText(text) {copies.push(text);}}},
    setTimeout(fn,delay) {const id = ++timerId;timers.set(id,{fn,delay});return id;},clearTimeout(id) {timers.delete(id);},addEventListener() {},
  };
  const controller = history.create({environment});
  return {document,created,environment,controller,calls,copies,timers,state,$:id => ids.get(id),
    types:() => calls.map(call => call.type),
    runtime:async message => {for (const listener of runtimeListeners) await listener(message);await settle();},
    storage:async changes => {for (const listener of storageListeners) await listener(changes,'local');},
    articles:() => nodes(ids.get('history-list'),'article'),
    ids:() => nodes(ids.get('history-list'),'article').map(article => article.dataset.entryId),
    async search(value) {
      ids.get('history-search').value = value;await ids.get('history-search').trigger('input');
      const pending = [...timers.entries()].filter(([,timer]) => timer.delay === 300);
      assert.equal(pending.length,1,'Typing debounces into one search');
      for (const [id,timer] of pending) {timers.delete(id);timer.fn();}
      await settle();
    },
    async openFirstAnswer() {const details = nodes(ids.get('history-list'),'details')[0];details.open = true;await details.trigger('toggle');return details;},
  };
}

test('records only open canonical X posts and exclude credentials and active schemes',() => {
  assert.equal(history.safePostUrl('https://twitter.com/Example/status/123/photo/1?s=20'),'https://x.com/example/status/123');
  assert.equal(history.safePostUrl('https://x.com/i/status/456'),'https://x.com/i/status/456');
  assert.equal(history.safePostUrl('https://x.com/i/web/status/456'),'https://x.com/i/web/status/456');
  for (const value of ['javascript:alert(1)','data:text/html,x','https://evil.test/test/status/1','https://x.com.evil.test/test/status/1','https://user:pass@x.com/test/status/1','https://x.com/home','/test/status/1']) assert.equal(history.safePostUrl(value),null);
});

test('records normalize untrusted DTOs, reject invalid links and bound render input',() => {
  const records = history.normalizeRecords([
    record('1',{text:'x'.repeat(13000),answers:[answer({text:'y'.repeat(31000),sources:[{url:'javascript:alert(1)'},{url:'https://user:pass@example.com'},{url:'https://example.com',title:'Source'}]})],comments:['a','b','c','d']}),
    record('1'),record('2',{url:'https://evil.test/post'}),record('3',{activityAt:NaN}),record('../4'),{...record('5'),id:'5',url:'https://x.com/test/status/5',answers:'bad',preferred:'x'},
  ]);
  assert.deepEqual(records.map(item => item.id),['1','5']);
  assert.equal(records[0].text.length,12000);assert.equal(records[0].answers[0].text.length,30000);assert.equal(records[0].answers[0].sources.length,1);assert.deepEqual(records[0].comments,['a','b','c']);
  assert.deepEqual(records[1].answers,[]);assert.equal(records[1].preferred,0);
  assert.equal(history.normalizeRecords('not an array').length,0);
});

test('records suppress old tool-only answer pollution without hiding the post or making API requests',async () => {
  const command = '{"absolute_path":"web_search","query":"private tool progress"}';
  const [normalized] = history.normalizeRecords([record('1',{text:command,answers:[answer({text:command,sources:[{url:'https://example.com/tool-progress',title:'Tool progress'}],usage:{total_tokens:17}})]})]);
  assert.equal(normalized.text,command,'The saved post itself remains unchanged');
  assert.equal(normalized.answers[0].text,'');assert.equal(normalized.answers[0].verificationStatus,'incomplete');assert.deepEqual(normalized.answers[0].sources,[]);
  const page = fixture({records:[record('1',{answers:[answer({text:command})]})]});await page.controller.start();
  assert.doesNotMatch(page.$('history-list').textContent,/absolute_path|private tool progress/);
  assert.match(page.$('history-list').textContent,/Fact check incomplete/);
  assert.equal(nodes(page.$('history-list'),'details').length,0);
  assert.deepEqual(page.types().sort(),['GET_CACHE_USAGE','GET_CONFIG','GET_RECORDS','GET_UI_LANGUAGE']);
});

test('records preserve legitimate JSON and code that accompanies saved evidence',async () => {
  for (const text of ['{"count":8,"status":"reported"}','```json\n{"count":8}\n```','Evidence notes:\n\n{"absolute_path":"web_search","query":"quoted diagnostic"}']) {
    const page = fixture({records:[record('1',{answers:[answer({text})]})]});await page.controller.start();await page.openFirstAnswer();
    const body = nodes(page.$('history-list'),'details')[0].textContent;
    if (text.includes('absolute_path')) assert.match(body,/absolute_path/);else assert.match(body,/8/);
    assert.doesNotMatch(body,/Fact check incomplete/);
  }
});

test('posts and expanded model HTML stay inert, without images or network generation',async () => {
  const page = fixture({records:[record('1',{author:'<img src=x>',text:'<img src=x onerror=alert(1)>',answers:[answer({text:'# **A heading**\n\n<img src="https://tracker.test/pixel" onerror=alert(1)>\n\n![track](https://tracker.test/image)\n\n[bad](javascript:alert(1))',model:'<svg onload=alert(1)>'})]})]});
  await page.controller.start();await page.openFirstAnswer();
  assert.match(page.$('history-list').textContent,/<img src=x onerror=alert\(1\)>/);
  assert.match(page.$('history-list').textContent,/<svg onload=alert\(1\)>/);
  assert.equal(nodes(page.$('history-list'),'img').length,0);assert.equal(nodes(page.$('history-list'),'svg').length,0);
  assert.equal(nodes(page.$('history-list'),'strong').length,1);
  assert.deepEqual(page.types().sort(),['GET_CACHE_USAGE','GET_CONFIG','GET_RECORDS','GET_UI_LANGUAGE']);
});

test('records open original posts safely and hide only duplicate sources',async () => {
  const page = fixture({records:[record('1',{answers:[answer({text:'[Already cited](https://example.com/a)',sources:[{url:'https://example.com/a',title:'1'},{url:'https://example.org/report',title:'2'},{url:'https://example.net/report',title:'Named source'}]})]})]});
  await page.controller.start();await page.openFirstAnswer();
  const links = nodes(page.$('history-list'),'a');
  assert.equal(links.filter(link => link.href === 'https://example.com/a').length,1);
  assert.ok(links.some(link => link.textContent === 'example.org'));assert.ok(links.some(link => link.textContent === 'Named source'));
  for (const link of links) {assert.equal(link.target,'_blank');assert.match(link.rel,/noopener/);assert.match(link.rel,/noreferrer/);}
});

test('a comment-only record shows its drafts and a record without a snapshot says the post was not saved',async () => {
  const page = fixture({records:[record('2',{answers:[],comments:['Draft only']}),record('3',{hasSnapshot:false,text:'',author:''})]});await page.controller.start();
  assert.deepEqual(page.ids(),['2','3']);
  const [comments,missing] = page.articles();
  assert.equal(nodes(comments,'details').length,1);assert.doesNotMatch(comments.textContent,/Original post not saved/);
  await page.openFirstAnswer();assert.match(comments.textContent,/Draft only/);
  assert.match(missing.textContent,/Original post not saved/);assert.match(missing.textContent,/^test/,'The author falls back to the URL handle');
  await page.runtime({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'});assert.match(missing.textContent,/原帖未保存/);
});

test('records load 50 at a time by cursor and Show more appends without reordering',async () => {
  const page = fixture({records:Array.from({length:120},(_,index) => record(String(index + 1)))});await page.controller.start();
  assert.equal(page.articles().length,50);assert.equal(page.ids()[0],'1');assert.equal(page.$('history-more').hidden,false);assert.equal(page.$('more-history').textContent,'Show more');
  const first = page.articles()[0];
  await page.$('more-history').trigger('click');assert.equal(page.articles().length,100);assert.equal(page.articles()[0],first);
  assert.deepEqual(page.calls.filter(call => call.type === 'GET_RECORDS').at(-1).after,[current - 50,'50']);
  await page.$('more-history').trigger('click');assert.equal(page.articles().length,120);assert.equal(page.$('history-more').hidden,true);
  assert.equal(new Set(page.ids()).size,120);
});

test('search runs in the worker over posts, answers and comments, debounced, with older-record paging',async () => {
  const records = [record('1',{answers:[answer({text:'Quantum phrase'})]}),record('2',{comments:['Draft phrase']}),...Array.from({length:4},(_,index) => record(String(index + 10),{text:`needle ${index}`}))];
  const page = fixture({records,pageSize:2});await page.controller.start();
  await page.search('quantum');assert.deepEqual(page.ids(),['1']);
  assert.deepEqual(page.calls.filter(call => call.type === 'GET_RECORDS').at(-1),{type:'GET_RECORDS',query:'quantum'});
  await page.search('draft');assert.deepEqual(page.ids(),['2']);
  await page.search('needle');assert.deepEqual(page.ids(),['10','11']);assert.equal(page.$('history-more').hidden,false);assert.equal(page.$('more-history').textContent,'Search older records');
  await page.$('more-history').trigger('click');assert.deepEqual(page.ids(),['10','11','12','13']);
  assert.deepEqual(page.calls.filter(call => call.type === 'GET_RECORDS').at(-1),{type:'GET_RECORDS',after:[current - 11,'11'],query:'needle'});
  await page.search('absent');assert.equal(page.$('history-empty').hidden,false);assert.match(page.$('empty-title').textContent,/No matching/);
  await page.search('');assert.equal(page.$('more-history').textContent,'Show more');assert.equal(page.articles().length,2);
  assert.equal(page.calls.some(call => ['DELETE_HISTORY','CLEAR_HISTORY'].includes(call.type)),false);
});

test('a record switches between saved answer versions and defaults to the preferred one',async () => {
  const versions = [answer({index:0,provider:'api',model:'grok-4.3',text:'**API answer**'}),answer({index:1,provider:'oauth',account:'abcd1234',model:'grok-4.7',text:'**OAuth answer**',completedAt:current - 9000})];
  const page = fixture({records:[record('1',{answers:versions,preferred:1}),record('2')]});await page.controller.start();
  const [select] = nodes(page.$('history-list'),'select');
  assert.equal(nodes(page.$('history-list'),'select').length,1,'Single-version records have no selector');
  assert.equal(select.value,'1');assert.equal(select.getAttribute('aria-label'),'Version');
  assert.match(nodes(select,'option')[1].textContent,/grok-4\.7 · abcd1234/);assert.match(nodes(select,'option')[0].textContent,/xAI API.*grok-4\.3/);
  await page.openFirstAnswer();assert.equal(nodes(page.$('history-list'),'strong')[0].textContent,'OAuth answer');
  select.value = '0';await select.trigger('change');
  const details = nodes(page.$('history-list'),'details')[0];
  assert.equal(details.open,true,'The expanded state survives a version switch');assert.equal(nodes(details,'strong')[0].textContent,'API answer');
  assert.equal(nodes(page.$('history-list'),'select')[0].value,'0');
  assert.equal(page.calls.filter(call => call.type === 'GET_RECORDS').length,1,'Switching versions reads nothing new');
});

for (const [percent,level,hint] of [[50,'success',false],[80,'warning',false],[95,'danger',true]]) {
  test(`the storage meter shows ${percent}% as ${level}${hint ? ' with the eviction hint' : ''}`,async () => {
    const page = fixture({records:Array.from({length:3},(_,index) => record(String(index + 1))),usedBytes:Math.ceil(1024 * MB * percent / 100)});await page.controller.start();
    const meter = page.$('usage-meter');
    assert.equal(page.$('usage').hidden,false);assert.equal(meter.getAttribute('aria-valuenow'),String(percent));assert.equal(meter.dataset.level,level);assert.equal(page.$('usage-fill').style.width,`${percent}%`);
    assert.equal(page.$('usage-text').textContent,`Used ${Math.round(1024 * percent / 100).toLocaleString('en')} MB / 1,024 MB · 3 records`);
    assert.equal(meter.getAttribute('aria-valuetext'),page.$('usage-text').textContent);
    assert.equal(page.$('usage-hint').hidden,!hint);
  });
}

test('the records page markup declares an accessible meter with a settings link',() => {
  const html = fs.readFileSync(path.join(__dirname,'../extension/history.html'),'utf8');
  assert.match(html,/id="usage-meter"[^>]*role="meter"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"/);
  assert.match(html,/id="usage-hint"[^>]*hidden>.*data-i18n="history.usageHint".*href="options.html#maintenance-heading"[^>]*data-i18n="history.usageSettings"/);
  assert.doesNotMatch(html,/history-enabled|role="switch"|history-count/);
  assert.equal(ui.t('history.usage','zh-CN',{used:'312',limit:'1,024',count:'1,234'}),'已用 312 MB / 1,024 MB · 1,234 条记录');
  assert.equal(ui.t('history.usageHint','zh-CN'),'超出后会删除最久未用的记录。');
  for (const locale of ui.SUPPORTED_LANGUAGES) for (const key of ['history.usage','history.newRecords','history.noSnapshot','history.searchMore','history.version','history.activity'])
    assert.ok(ui.catalog[locale][key] && (locale === 'en' || key === 'history.version' || ui.catalog[locale][key] !== ui.catalog.en[key]),`${locale}: ${key}`);
});

test('a records notice refreshes the meter and announces new records without moving the list',async () => {
  const page = fixture({records:Array.from({length:60},(_,index) => record(String(index + 10)))});await page.controller.start();
  await page.$('more-history').trigger('click');page.$('history-search').value = 'draft text';
  const rows = page.articles(),reads = page.calls.filter(call => call.type === 'GET_RECORDS').length;
  page.state.records.push(record('1'),record('2'));page.state.usedBytes = 900 * MB;
  await page.runtime({type:'HISTORY_CHANGED',epoch:0});
  assert.equal(page.$('new-records').hidden,false);assert.equal(page.$('new-records').textContent,'2 new records. Click to refresh');
  assert.equal(page.$('usage-meter').dataset.level,'warning');
  assert.deepEqual(page.articles(),rows,'Paging stays in place');assert.equal(page.$('history-search').value,'draft text','Search input is untouched');
  assert.equal(page.calls.filter(call => call.type === 'GET_RECORDS').length,reads);
  await page.runtime({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'});assert.equal(page.$('new-records').textContent,'有 2 条新记录，点击刷新');
  page.$('history-search').value = '';await page.$('new-records').trigger('click');
  assert.equal(page.$('new-records').hidden,true);assert.deepEqual(page.ids().slice(0,2),['1','2']);
});

test('an epoch change from another page reloads the whole list',async () => {
  const page = fixture({records:[record('1'),record('2')]});await page.controller.start();
  page.state.records = page.state.records.filter(item => item.id !== '1');page.state.epoch = 3;
  await page.runtime({type:'HISTORY_CHANGED',epoch:3});
  assert.deepEqual(page.ids(),['2']);assert.equal(page.$('new-records').hidden,true);
  const reads = page.calls.filter(call => call.type === 'GET_RECORDS').length;
  page.state.epoch = 4;await page.runtime({type:'HISTORY_CHANGED'});
  assert.equal(page.calls.filter(call => call.type === 'GET_RECORDS').length,reads + 1,'A usage read with a new epoch also reloads');
});

test('a cursor from an old epoch is discarded and the list reloads from the top',async () => {
  const page = fixture({records:Array.from({length:60},(_,index) => record(String(index + 1)))});await page.controller.start();
  page.state.records = page.state.records.slice(10);page.state.epoch = 1;
  await page.$('more-history').trigger('click');await settle();
  assert.equal(page.ids()[0],'11');assert.equal(page.articles().length,50);
});

test('an unavailable store shows a retryable load error and never a fake empty success',async () => {
  let fail = true;const page = fixture({send:message => message.type === 'GET_RECORDS' && fail ? {ok:false} : undefined});await page.controller.start();
  assert.equal(page.$('history-status').dataset.state,'error');assert.equal(page.$('history-empty').hidden,true);assert.equal(page.$('refresh-history').disabled,false);
  fail = false;await page.controller.refresh();assert.equal(page.articles().length,1);assert.equal(page.$('history-status').dataset.state,'success');
});

test('a failed delete preserves records and reports failure instead of success',async () => {
  const page = fixture({send:message => message.type === 'DELETE_HISTORY' ? {ok:false} : undefined});await page.controller.start();
  await nodes(page.$('history-list'),'button')[0].trigger('click');
  assert.equal(page.articles().length,1);assert.equal(page.$('history-status').dataset.state,'error');assert.match(page.$('history-status').textContent,/delete/i);
});

test('a malformed mutation acknowledgement never removes a record',async () => {
  const page = fixture({send:message => message.type === 'DELETE_HISTORY' ? {ok:true} : undefined});await page.controller.start();await nodes(page.$('history-list'),'button')[0].trigger('click');
  assert.equal(page.articles().length,1);assert.equal(page.$('history-status').dataset.state,'error');
});

test('delete removes the record in place, refreshes the meter and its own epoch notice does not reload',async () => {
  const page = fixture({records:[record('1'),record('2')]});await page.controller.start();
  await nodes(page.$('history-list'),'button')[0].trigger('click');await settle();
  assert.deepEqual(page.ids(),['2']);assert.equal(page.document.activeElement,page.$('history-search'));assert.match(page.$('history-status').textContent,/Record deleted/);
  assert.match(page.$('usage-text').textContent,/· 1 records/);
  const reads = page.calls.filter(call => call.type === 'GET_RECORDS').length;
  await page.runtime({type:'HISTORY_CHANGED',epoch:1});
  assert.equal(page.calls.filter(call => call.type === 'GET_RECORDS').length,reads);assert.equal(page.$('new-records').hidden,true);
});

test('an old refresh cannot resurrect a record deleted while it was loading',async () => {
  const pending = deferred();let delayed = false;
  const page = fixture({send:message => message.type === 'GET_RECORDS' && delayed ? pending.promise : undefined});await page.controller.start();
  delayed = true;const refreshing = page.controller.refresh();await nodes(page.$('history-list'),'button')[0].trigger('click');
  pending.resolve({ok:true,epoch:0,records:[record()],next:null});await refreshing;assert.equal(page.articles().length,0);assert.match(page.$('history-status').textContent,/deleted/i);
});

test('clear uses a lightweight confirmation and cancellation sends no mutation',async () => {
  const page = fixture();await page.controller.start();const count = page.calls.length;await page.$('clear-history').trigger('click');
  assert.equal(page.$('clear-confirmation').hidden,false);assert.equal(page.document.activeElement,page.$('confirm-clear'));assert.equal(page.calls.length,count);
  await page.$('cancel-clear').trigger('click');assert.equal(page.$('clear-confirmation').hidden,true);assert.equal(page.articles().length,1);assert.equal(page.document.activeElement,page.$('clear-history'));
});

test('failed clear keeps saved records and confirmation for retry',async () => {
  const page = fixture({send:message => message.type === 'CLEAR_HISTORY' ? {ok:false} : undefined});await page.controller.start();await page.$('clear-history').trigger('click');await page.$('confirm-clear').trigger('click');
  assert.equal(page.articles().length,1);assert.equal(page.$('clear-confirmation').hidden,false);assert.equal(page.$('history-status').dataset.state,'error');assert.equal(page.$('confirm-clear').disabled,false);
});

test('successful clear acknowledges an empty list, empties the meter and closes confirmation',async () => {
  const page = fixture();await page.controller.start();await page.$('clear-history').trigger('click');await page.$('confirm-clear').trigger('click');await settle();
  assert.equal(page.articles().length,0);assert.equal(page.$('clear-confirmation').hidden,true);assert.equal(page.$('history-empty').hidden,false);assert.equal(page.$('clear-history').disabled,true);
  assert.equal(page.$('usage-text').textContent,'Used 0 MB / 1,024 MB · 0 records');assert.equal(page.$('history-more').hidden,true);
});

test('copy uses saved drafts only and reports clipboard errors truthfully',async () => {
  const page = fixture({records:[record('1',{answers:[],comments:['Saved one-line comment']})]});await page.controller.start();const details = await page.openFirstAnswer(),button = nodes(details,'button')[0],count = page.calls.length;
  await button.trigger('click');assert.deepEqual(page.copies,['Saved one-line comment']);assert.equal(page.calls.length,count);assert.match(page.$('history-status').textContent,/Copied/i);
  page.environment.navigator.clipboard.writeText = async () => {throw new Error('Denied');};await button.trigger('click');assert.equal(page.$('history-status').dataset.state,'error');
});

test('interface language follows X automatically while a manual choice takes precedence',async () => {
  const page = fixture();await page.controller.start();await page.runtime({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'});assert.equal(page.document.documentElement.lang,'zh-CN');assert.equal(page.document.title,'SuperX · 核查记录');
  await page.storage({settings:{newValue:core.normalizeSettings({interfaceLanguage:'ja'})}});assert.equal(page.document.documentElement.lang,'ja');
  await page.runtime({type:'UI_LANGUAGE_CHANGED',language:'ar'});assert.equal(page.document.documentElement.lang,'ja');
  await page.storage({settings:{newValue:core.normalizeSettings({interfaceLanguage:'auto'})}});assert.equal(page.document.documentElement.lang,'ar');assert.equal(page.document.documentElement.dir,'rtl');
});

test('late initial locale results do not overwrite a newer X language event',async () => {
  const pending = deferred();const page = fixture({send:message => message.type === 'GET_UI_LANGUAGE' ? pending.promise : undefined});
  const starting = page.controller.start();await page.runtime({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'});pending.resolve({ok:true,language:'en'});await starting;
  assert.equal(page.document.documentElement.lang,'zh-CN');
});

test('late initial config cannot overwrite a new manual interface language',async () => {
  const pending = deferred();const page = fixture({send:message => message.type === 'GET_CONFIG' ? pending.promise : undefined});const starting = page.controller.start();
  await page.storage({settings:{newValue:core.normalizeSettings({interfaceLanguage:'ja'})}});pending.resolve({ok:true,settings:core.normalizeSettings({interfaceLanguage:'en'})});await starting;assert.equal(page.document.documentElement.lang,'ja');
});

test('the newest refresh wins when two record reads finish out of order',async () => {
  const reads = [deferred(),deferred()];let delayed = false,index = 0;
  const page = fixture({send:message => message.type === 'GET_RECORDS' && delayed ? reads[index++].promise : undefined});await page.controller.start();delayed = true;
  const first = page.controller.refresh(),second = page.controller.refresh();reads[1].resolve({ok:true,epoch:0,records:[record('2')],next:null});await second;reads[0].resolve({ok:true,epoch:0,records:[record('1')],next:null});await first;assert.deepEqual(page.ids(),['2']);
});

test('a saved answer stays expanded through search and language changes',async () => {
  const page = fixture();await page.controller.start();await page.openFirstAnswer();
  await page.search('saved');assert.equal(nodes(page.$('history-list'),'details')[0].open,true);assert.equal(nodes(page.$('history-list'),'strong')[0].textContent,'Saved answer');
  await page.runtime({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'});assert.equal(nodes(page.$('history-list'),'details')[0].open,true);
});

test('an unchanged record read preserves answer DOM and focused buttons',async () => {
  const page = fixture({records:[record('1',{answers:[answer({text:'**Read this answer**'})],comments:['Saved draft']})]});await page.controller.start();
  const details = await page.openFirstAnswer(),strong = nodes(details,'strong')[0],button = nodes(details,'button')[0],row = page.articles()[0];button.focus();
  const count = page.created.length;await page.controller.refresh();
  assert.equal(page.articles()[0],row);assert.equal(nodes(page.$('history-list'),'details')[0],details);assert.equal(nodes(details,'strong')[0],strong);assert.equal(page.document.activeElement,button);assert.equal(page.created.length,count);
});

test('answer DOM survives language changes while labels translate in place',async () => {
  const page = fixture({records:[record('1',{answers:[answer({usage:{total_tokens:1200}})]})]});await page.controller.start();
  const details = await page.openFirstAnswer(),strong = nodes(details,'strong')[0];await page.runtime({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'});
  assert.equal(nodes(page.$('history-list'),'strong')[0],strong);assert.equal(nodes(page.$('history-list'),'details')[0],details);assert.match(nodes(details,'summary')[0].textContent,/收起/);
});

test('a passive reload waits for a reader to finish selecting an answer',async () => {
  const page = fixture({records:[record('1',{answers:[answer({text:'**First answer**'})]})]});await page.controller.start();const details = await page.openFirstAnswer(),strong = nodes(details,'strong')[0];
  let selection = {isCollapsed:false,anchorNode:strong.childNodes[0],focusNode:strong.childNodes[0]};page.environment.getSelection = () => selection;
  page.state.records = [record('1',{answers:[answer({text:'**Updated answer**'})]})];page.state.epoch = 1;await page.runtime({type:'HISTORY_CHANGED',epoch:1});
  assert.equal(nodes(page.$('history-list'),'strong')[0],strong);assert.match(page.$('history-list').textContent,/First answer/);assert.doesNotMatch(page.$('history-list').textContent,/Updated answer/);
  selection = {isCollapsed:true};await page.document.documentElement.trigger('selectionchange');assert.match(page.$('history-list').textContent,/Updated answer/);
});

test('explicit clear still removes selected text after acknowledgement',async () => {
  const page = fixture();await page.controller.start();const details = await page.openFirstAnswer(),text = nodes(details,'strong')[0].childNodes[0];
  page.environment.getSelection = () => ({isCollapsed:false,anchorNode:text,focusNode:text});await page.$('clear-history').trigger('click');await page.$('confirm-clear').trigger('click');assert.equal(page.articles().length,0);
});

test('queued details toggles do not rebuild a restored answer or mutate its replacement',async () => {
  const page = fixture();await page.controller.start();const details = await page.openFirstAnswer(),strong = nodes(details,'strong')[0];
  await details.trigger('toggle');assert.equal(nodes(details,'strong')[0],strong);
  page.state.records = [record('1',{answers:[answer({text:'**Replacement answer**'})]})];await page.controller.refresh();const replacement = nodes(page.$('history-list'),'details')[0];assert.notEqual(replacement,details);assert.equal(replacement.open,true);
  details.open = false;await details.trigger('toggle');page.controller.render();assert.equal(replacement.open,true);assert.match(nodes(replacement,'summary')[0].textContent,/Hide/);
});

test('closed answers release rendered nodes and reopen safely on demand',async () => {
  const page = fixture();await page.controller.start();const details = await page.openFirstAnswer();assert.equal(nodes(details,'strong').length,1);
  details.open = false;await details.trigger('toggle');assert.equal(nodes(details,'strong').length,0);
  details.open = true;await details.trigger('toggle');assert.equal(nodes(details,'strong').length,1);
});

test('invalid usage and boundary metadata cannot break rendering a saved answer',async () => {
  const page = fixture({records:[record('1',{answers:[answer({text:'**Available answer**',verificationStart:'1',usage:{total_tokens:-1,input_tokens:-1,output_tokens:'x'}})]})],send:message => message.type === 'GET_CACHE_USAGE' ? {ok:true,epoch:0,bytes:-1,limitBytes:1,records:0} : undefined});
  await page.controller.start();await page.openFirstAnswer();assert.equal(nodes(page.$('history-list'),'strong')[0].textContent,'Available answer');assert.equal(page.$('history-status').dataset.state,'success');
  assert.equal(page.$('usage').hidden,true,'A malformed usage reply hides the meter rather than showing a wrong value');
});

test('the records page never sends retired history messages',async () => {
  const page = fixture();await page.controller.start();await page.search('x');await page.runtime({type:'HISTORY_CHANGED',epoch:0});
  assert.equal(page.calls.some(call => ['GET_HISTORY','SET_HISTORY_ENABLED','GET_HISTORY_STATUS','HISTORY_VISIT'].includes(call.type)),false);
});
