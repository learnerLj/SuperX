'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { IDBFactory, IDBKeyRange, IDBObjectStore } = require('fake-indexeddb');
const { ZipReader, Uint8ArrayReader, TextWriter } = require('@zip.js/zip.js');
const marked = require('../extension/marked.umd.js');
const { JSDOM } = require('jsdom');
const Cache = require('../extension/answer-cache.js');
const Core = require('../extension/feed-core.js');
const { exportCache } = require('../extension/cache-export.js');
const exportedAt = Date.UTC(2026, 9, 28, 9, 30);
const timestamp = new Date(exportedAt).toISOString();
const body = '## 核查\n\n中文与 $E=mc^2$\n\n$$\\frac{a}{b}$$\n\n> 引用 [1]\n\n原文无损。';
const secret = 'PRIVATE_ACCOUNT_CREDENTIAL_PROMPT_DIAGNOSTIC';
const hash = key => createHash('sha256').update(key).digest('hex');
const result = text => ({ text, provider: 'api', verificationStatus: 'completed' });

// These fixtures use the actual feed identity producer and the worker's current
// native/API/OAuth/Build key shapes, including private prompt/account partitions.
function key(kind = 'api', overrides = {}) {
  const s = { provider: kind, language: 'auto', webSearch: true, xSearch: true,
    apiModel: 'grok-4', oauthCredentialId: secret, oauthModel: 'grok-4-oauth',
    buildPort: 8765, buildModel: 'grok-4-build', ...overrides };
  const post = { url: 'https://x.com/alice/status/12345', text: '中文', language: 'zh-CN', ...overrides.post };
  if (kind === 'x-native') return JSON.stringify([
    'SuperX-native-answers-v1', kind, secret, Core.canonicalPostUrl(post.url),
    s.language, Core.resolvePostLanguage(s.language, post),
    'native-prompt-v1-fast-markdown-format', secret, 'fast',
  ]);
  return JSON.stringify(['GrokFirst-v1', kind,
    kind === 'build' ? ['official-ws-v1', s.buildPort, s.buildModel]
      : kind === 'oauth' ? [s.oauthCredentialId, s.oauthModel] : s.apiModel,
    s.language, s.webSearch, s.xSearch, 'api-v11-context-images', 'custom', 'only',
    Core.apiPostIdentity(post, s), 'fact-check-prompts-v2-deeper', secret,
    overrides.effort || 'high']);
}
function sinkWith(hooks = {}) {
  const chunks = [], state = { closed: 0, aborted: [] };
  return { state, chunks,
    sink: {
      async write(chunk) { await hooks.write?.(chunk); chunks.push(Buffer.from(chunk)); },
      async close() { state.closed++; await hooks.close?.(); },
      async abort(reason) { state.aborted.push(reason); await hooks.abort?.(reason); },
    },
    bytes: () => Buffer.concat(chunks),
  };
}
async function fixture(rows = []) {
  const indexedDB = new IDBFactory(), store = Cache.create({ indexedDB, keyRange: IDBKeyRange });
  await store.ready();
  await seed(indexedDB, rows);
  await store.close();
  return indexedDB;
}
async function connect(indexedDB) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('SuperXAnswers');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function seed(indexedDB, rows) {
  const db = await connect(indexedDB), tx = db.transaction('answers', 'readwrite');
  for (const [key, value] of rows) tx.objectStore('answers').put({ key, value, bytes: 0, lastAccess: 0 });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
  db.close();
}
async function assertReleased(indexedDB) {
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase('SuperXAnswers');
    r.onsuccess = resolve; r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Export leaked an IndexedDB connection'));
  });
}
const options = (indexedDB, output, format = 'jsonl', extra = {}) => ({ indexedDB, sink: output.sink,
  format, exportedAt, keyRange: IDBKeyRange, ...extra });
const lines = output => output.bytes().toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
async function unzip(output) {
  const reader = new ZipReader(new Uint8ArrayReader(output.bytes()), { useWebWorkers: false, useCompressionStream: false });
  const entries = await reader.getEntries();
  return { reader, entries, text: entry => entry.getData(new TextWriter(), { checkSignature: true, useWebWorkers: false, useCompressionStream: false }) };
}

test('bundle loads with only TextEncoder and exposes the public export function', () => {
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(readFileSync(require.resolve('../extension/cache-export.js'), 'utf8'), context);
  assert.equal(typeof context.SuperXCacheExport.exportCache, 'function');
});

test('JSONL is versioned, preserves analyses and variants, and exports a strict public whitelist', async () => {
  const keys = ['x-native', 'api', 'oauth', 'build'].map(p => key(p));
  const raw = { ...result(body), completedAt: 0, model: 'reported-model',
    verificationStatus: 'legacy-success', language: secret, rawKey: secret, nativeAccount: secret,
    credentialID: secret, requestDiagnostics: { providerMessage: secret }, warning: secret,
    verificationFailure: { reason: secret }, verifyPrompt: secret, unknown: { nested: secret },
    sources: [{ url: 'https://example.com/a?q=1&b=2', title: '资料' }, { url: 'javascript:alert(1)', title: secret },
      { url: 'file:///private', title: secret }, { url: 'https://example.com/\n# heading', title: secret }, null],
    usage: { input_tokens: 0, output_tokens: 12, total_tokens: 12, num_sources_used: 0,
      num_server_side_tools_used: 2, cost_in_usd_ticks: 0, arbitrary: secret,
      input_tokens_details: { cached_tokens: 0, text_tokens: 4, image_tokens: -1, audio_tokens: Infinity, prompt: secret },
      output_tokens_details: { reasoning_tokens: 0, audio_tokens: 2, diagnostic: secret },
      server_side_tool_usage_details: { web_search_calls: 0, x_search_calls: 1, mcp_calls: NaN, secret } },
    usageComplete: false, usageByStage: { verify: { total_tokens: 0, secret }, explain: { input_tokens: 2 }, [secret]: { total_tokens: 1 } },
    modelByStage: { verify: 'grok-4', [secret]: secret } };
  const indexedDB = await fixture(keys.map((k, i) => [k, { ...raw, provider: ['x-native', 'api', 'oauth', 'build'][i] }]));
  const output = sinkWith(), progress = [];
  assert.deepEqual(await exportCache(options(indexedDB, output, 'jsonl', { onProgress: p => progress.push(p) })), { exported: 4, skipped: 0 });
  const [manifest, ...rows] = lines(output);
  assert.equal(manifest.type, 'manifest'); assert.equal(manifest.format, 'superx-cache');
  assert.equal(manifest.version, 1); assert.equal(manifest.exportedAt, timestamp); assert.equal(manifest.consistency, 'read-time');
  assert.match(manifest.description, /not a consistent snapshot/);
  assert.equal(rows.length, 4); assert.equal(new Set(rows.map(r => r.variantId)).size, 4);
  for (const row of rows) {
    assert.equal(row.type, 'analysis'); assert.equal(row.postUrl, 'https://x.com/alice/status/12345');
    assert.equal(row.language, 'zh-CN'); assert.equal(row.text, body); assert.equal(row.completedAt, '1970-01-01T00:00:00.000Z');
    assert.equal(row.model, 'reported-model'); assert.equal(row.verificationStatus, 'legacy-success');
    assert.deepEqual(row.sources, [{ url: 'https://example.com/a?q=1&b=2', title: '资料' }]);
    assert.deepEqual(row.usage, { input_tokens: 0, output_tokens: 12, total_tokens: 12, num_sources_used: 0,
      num_server_side_tools_used: 2, cost_in_usd_ticks: 0, input_tokens_details: { cached_tokens: 0, text_tokens: 4 },
      output_tokens_details: { reasoning_tokens: 0, audio_tokens: 2 }, server_side_tool_usage_details: { web_search_calls: 0, x_search_calls: 1 } });
    assert.equal(row.usageComplete, false); assert.deepEqual(row.usageByStage, { explain: { input_tokens: 2 }, verify: { total_tokens: 0 } });
    assert.deepEqual(row.modelByStage, { verify: 'grok-4' });
    assert.ok(keys.some(k => hash(k) === row.variantId));
    assert.equal(row.reasoningEffort, row.provider === 'x-native' ? null : 'high');
    assert.deepEqual(Object.keys(row).sort(), ['type','variantId','postUrl','language','provider','model','reasoningEffort','completedAt','text','sources','verificationStatus','usage','usageComplete','usageByStage','modelByStage'].sort());
  }
  const all = output.bytes().toString('utf8'); assert.ok(!all.includes(secret));
  assert.ok(!all.includes('requestDiagnostics')); assert.ok(!all.includes('verifyPrompt'));
  assert.deepEqual(progress.at(-1), { exported: 4, skipped: 0 });
  assert.equal(output.state.closed, 1); assert.equal(output.state.aborted.length, 0); await assertReleased(indexedDB);
});

test('known keys supply model/effort and unknown, old or broken keys never guess a URL or language', async () => {
  const valid = ['x-native','api','oauth','build'].map(p => [key(p), { text: p }]);
  const old = JSON.parse(key()); old[9] = JSON.stringify(['https://x.com/alice/status/12345', 'zh-CN']);
  const wrong = JSON.parse(key()); wrong[9] = Core.apiPostIdentity({ url: 'https://x.com/alice/status/12345', text: '中文' }, { provider: 'oauth', language: 'zh-CN' });
  const malformed = JSON.parse(key()); malformed[2] = [secret];
  const future = JSON.parse(key()); future.push('future');
  const badKeys = ['not JSON', '{}', 'null', JSON.stringify(['unknown', 'https://x.com/alice/status/12345', 'zh-CN']), JSON.stringify(old), JSON.stringify(wrong), JSON.stringify(malformed), JSON.stringify(future)];
  const indexedDB = await fixture([...valid, ...badKeys.map(k => [k, { text: 'preserved', postUrl: 'https://x.com/leak/status/123', language: secret, completedAt: Infinity }])]);
  const output = sinkWith(); await exportCache(options(indexedDB, output));
  const rows = lines(output).slice(1);
  for (const [k, v] of valid) {
    const row = rows.find(r => r.variantId === hash(k)); assert.equal(row.text, v.text);
    assert.equal(row.model, { 'x-native': 'fast', api: 'grok-4', oauth: 'grok-4-oauth', build: 'grok-4-build' }[v.text]);
  }
  for (const k of badKeys) {
    const row = rows.find(r => r.variantId === hash(k)); assert.equal(row.text, 'preserved');
    for (const field of ['postUrl','language','provider','model','reasoningEffort','completedAt']) assert.equal(row[field], null);
  }
  await assertReleased(indexedDB);
});

test('post URLs require an HTTP(S) X/Twitter numeric status path and sources require HTTP(S)', async () => {
  const urls = ['https://x.com.evil.test/alice/status/12', 'https://x.com/alice/status/no', 'javascript:alert(1)',
    'https://example.com/alice/status/12', 'https://x.com/alice/status/12/extra', 'https://u:p@x.com/alice/status/12'];
  const rows = urls.map((url, i) => {
    const parts = JSON.parse(key()); parts[9] = JSON.stringify(['post-input-v4-source-full-url', 'api', url, 'zh-CN']);
    return [JSON.stringify(parts), { text: String(i) }];
  });
  rows.push([key('oauth', { post: { url: 'http://twitter.com/bob/status/67890' }, language: 'en' }), { text: 'valid' }]);
  const indexedDB = await fixture(rows), output = sinkWith(); await exportCache(options(indexedDB, output));
  for (const row of lines(output).slice(1)) assert.equal(row.postUrl, row.text === 'valid' ? 'https://x.com/bob/status/67890' : null);
});

test('empty databases are valid in both formats; bad bodies are counted without filtering historical status', async () => {
  for (const format of ['jsonl','markdown']) {
    const indexedDB = await fixture(), output = sinkWith();
    assert.deepEqual(await exportCache(options(indexedDB, output, format)), { exported: 0, skipped: 0 });
    if (format === 'jsonl') assert.equal(lines(output).length, 1);
    else { const zip = await unzip(output); assert.deepEqual(zip.entries.map(e => e.filename), ['README.md','export-summary.json']);
      assert.deepEqual(JSON.parse(await zip.text(zip.entries[1])), { exported: 0, skipped: 0, exportedAt: timestamp, version: 1, consistency: 'read-time' }); await zip.reader.close(); }
    await assertReleased(indexedDB);
  }
  const values = [null, undefined, {}, { text: 42 }, { text: '' }, { text: ' \n\t' }, { text: body, verificationStatus: 'old-status' }, { text: 'valid', verificationStatus: 'failed' }];
  const indexedDB = await fixture(values.map((v,i) => [String(i),v])), output = sinkWith();
  assert.deepEqual(await exportCache(options(indexedDB, output)), { exported: 2, skipped: 6 });
  assert.deepEqual(lines(output).slice(1).map(r => r.text), [body,'valid']);
});

test('real ZIP contains STORE Markdown, escaped metadata, original body, and a final summary', async () => {
  const k = key('build'), malicious = 'title\n\n# injected [click](https://evil.test) <script>run</script>';
  const indexedDB = await fixture([[k, { ...result(body), provider: 'build', model: 'model\n# fake', completedAt: 1,
    sources: [{ url: 'https://example.com/a_(b)?x=1&y=2', title: malicious }, { url: 'data:text/html,bad', title: secret }] }], ['../../escape', { text: body }]]);
  const output = sinkWith(); assert.deepEqual(await exportCache(options(indexedDB, output, 'markdown')), { exported: 2, skipped: 0 });
  const zip = await unzip(output);
  assert.equal(zip.entries.length, 4); assert.equal(zip.entries[0].filename, 'README.md'); assert.equal(zip.entries.at(-1).filename, 'export-summary.json');
  for (const entry of zip.entries) assert.equal(entry.compressionMethod, 0);
  for (const entry of zip.entries.slice(1,-1)) assert.match(entry.filename, /^analysis-[a-f0-9]{64}\.md$/);
  const md = await zip.text(zip.entries.find(e => e.filename === `analysis-${hash(k)}.md`));
  assert.ok(md.includes(body)); assert.match(md, /Post URL: <https:/); assert.ok(md.includes('1970'));
  assert.ok(!md.includes('\n# fake')); assert.ok(!md.includes('\n# injected')); assert.ok(!md.includes('<script>'));
  const html = marked.parse(md);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<h1>fake'));
  assert.ok(!md.includes(secret));
  const readme = await zip.text(zip.entries[0]); assert.match(readme, /not a consistent snapshot/); assert.match(readme, /JSONL/); assert.match(readme, /no original post text/);
  assert.deepEqual(JSON.parse(await zip.text(zip.entries.at(-1))), { exported: 2, skipped: 0, exportedAt: timestamp, version: 1, consistency: 'read-time' });
  await zip.reader.close(); await assertReleased(indexedDB);
});

test('Markdown autolinks preserve public URL hrefs and metadata stays plain text under the actual marked parser', async () => {
  const k = key('api');
  const title = '报告 v1.2-beta\n# heading **bold** _em_ [click](/attack) ![image](/image) <img src=x onerror=alert(1)> & "quotes" `code`';
  const model = 'grok-4.1-fast\n<script>alert(1)</script> **model**';
  const sourceUrls = ['https://example.com/a_(b)?x=1&y=2#part',
    new URL('https://example.com/\"><img/src=x/onerror=alert(1)>').href];
  const indexedDB = await fixture([[k, { ...result(body), model,
    sources: sourceUrls.map(url => ({ url, title })) }]]);
  const output = sinkWith(); await exportCache(options(indexedDB, output, 'markdown'));
  const zip = await unzip(output), md = await zip.text(zip.entries.find(e => e.filename === `analysis-${hash(k)}.md`));
  assert.ok(md.includes(body), 'formula and Chinese quotation Markdown is unchanged');
  assert.ok(md.includes('grok-4.1-fast')); assert.ok(md.includes('报告 v1.2-beta'));
  const hrefs = [];
  marked.walkTokens(marked.lexer(md), token => { if (token.type === 'link') hrefs.push(token.href); });
  const expected = ['https://x.com/alice/status/12345', ...sourceUrls];
  assert.deepEqual(hrefs, expected, 'lexer recognizes exact public URLs, not links injected by titles');
  const document = new JSDOM(marked.parse(md)).window.document;
  assert.deepEqual([...document.querySelectorAll('a')].map(a => a.getAttribute('href')), expected);
  assert.equal(document.querySelectorAll('script,img,strong,em,code').length, 0);
  assert.equal(document.querySelectorAll('h1').length, 0);
  const sourceItems = [...document.querySelectorAll('li')]; assert.equal(sourceItems.length, 2);
  for (const item of sourceItems) assert.ok(item.textContent.startsWith(title.replace(/\n/g, ' ') + ' '));
  assert.ok(document.body.textContent.includes(model.replace(/\n/g, ' ')));
  assert.ok(document.querySelector('blockquote').textContent.includes('引用 [1]'));
  await zip.reader.close(); await assertReleased(indexedDB);
});

test('a slow sink applies backpressure and emits the first analysis before reading later pages', async () => {
  for (const format of ['jsonl','markdown']) {
    const indexedDB = await fixture(Array.from({length:260}, (_,i) => [String(i).padStart(4,'0'), { text: `FIRST_BODY_${i}` }]));
    const original = IDBObjectStore.prototype.openCursor; let reads = 0, inFlight = 0, maximum = 0;
    let release, notify; const blocked = new Promise(resolve => { notify = resolve; }); let held = false;
    IDBObjectStore.prototype.openCursor = function(...args) { if (this.name === 'answers') reads++; return original.apply(this,args); };
    try {
      const output = sinkWith({ async write(chunk) {
        inFlight++; maximum = Math.max(maximum,inFlight);
        if (!held && Buffer.from(chunk).includes(Buffer.from('FIRST_BODY_0'))) {
          held = true; notify(); await new Promise(resolve => { release = resolve; });
        }
        await new Promise(resolve => setImmediate(resolve)); inFlight--;
      } });
      const exporting = exportCache(options(indexedDB, output, format));
      await blocked; assert.equal(reads, 1); assert.equal(inFlight, 1);
      await new Promise(resolve => setImmediate(resolve)); assert.equal(reads, 1); release();
      assert.deepEqual(await exporting, { exported: 260, skipped: 0 }); assert.equal(reads, 3); assert.equal(maximum, 1);
    } finally { release?.(); IDBObjectStore.prototype.openCursor = original; }
    await assertReleased(indexedDB);
  }
});

test('each export sees later batches at read time; concurrent deletion/clear cannot repeat or loop', async () => {
  const indexedDB = await fixture(Array.from({length:260}, (_,i) => [String(i).padStart(4,'0'), { text: String(i) }]));
  const original = IDBObjectStore.prototype.openCursor; let reads = 0;
  IDBObjectStore.prototype.openCursor = function(...args) { if (this.name === 'answers') reads++; return original.apply(this,args); };
  const output = sinkWith({ async write(chunk) {
    if (Buffer.from(chunk).includes(Buffer.from('"text":"127"'))) {
      const store = Cache.create({ indexedDB }); await store.clear(); await store.close();
      await seed(indexedDB, [['0000', {text:'behind'}],['9999',{text:'new-ahead'}]]);
    }
  } });
  try { assert.deepEqual(await exportCache(options(indexedDB, output)), { exported:129, skipped:0 }); }
  finally { IDBObjectStore.prototype.openCursor = original; }
  const rows = lines(output).slice(1); assert.equal(reads,2); assert.equal(rows.at(-1).text,'new-ahead');
  assert.equal(new Set(rows.map(r=>r.variantId)).size,129); assert.ok(!rows.some(r=>r.text==='behind')); await assertReleased(indexedDB);
});

test('cancellation before start, during writes and progress aborts with its reason; retry succeeds', async () => {
  for (const format of ['jsonl','markdown']) for (const when of ['before','write','progress']) {
    const indexedDB = await fixture([['a',result(body)],['b',result('second')]]), controller = new AbortController();
    const reason = new Error(`cancel-${format}-${when}`), output = sinkWith({
      async write() { if (when==='write') controller.abort(reason); },
      async abort() { throw new Error('abort must not replace cancellation'); },
    });
    if (when==='before') controller.abort(reason);
    const progress=[];
    await assert.rejects(exportCache(options(indexedDB,output,format,{ signal:controller.signal,
      onProgress(p) { progress.push(p); if(when==='progress') controller.abort(reason); } })), e=>e===reason);
    assert.equal(output.state.aborted.length,1); assert.equal(output.state.aborted[0],reason);
    if (when==='before'||when==='write') assert.equal(progress.length,0);
    const retry=sinkWith(); assert.deepEqual(await exportCache(options(indexedDB,retry,format)),{exported:2,skipped:0});
    await assertReleased(indexedDB);
  }
});

for (const format of ['jsonl', 'markdown']) test(`${format} close commit is successful even when the signal aborts before close resolves`, async () => {
  const indexedDB = await fixture([['a', result(body)]]), controller = new AbortController();
  let committed = false;
  const output = sinkWith({
    async close() { committed = true; controller.abort(new Error('cancel after commit')); },
    async abort() { if (committed) throw new Error('Cannot abort a committed destination'); },
  });
  assert.deepEqual(await exportCache(options(indexedDB, output, format, { signal: controller.signal })), { exported: 1, skipped: 0 });
  assert.equal(committed, true); assert.equal(controller.signal.aborted, true);
  assert.equal(output.state.closed, 1); assert.deepEqual(output.state.aborted, []);
  if (format === 'jsonl') assert.equal(lines(output)[1].text, body);
  else { const zip = await unzip(output); assert.equal(JSON.parse(await zip.text(zip.entries.at(-1))).exported, 1); await zip.reader.close(); }
  await assertReleased(indexedDB);
});

test('cancel during ZIP close still aborts the uncommitted sink and rejects with its reason', async () => {
  const indexedDB = await fixture([['a', result(body)]]), controller = new AbortController();
  const reason = new Error('cancel during archive close'); let cancelled = false;
  const output = sinkWith({ async write(chunk) {
    if (Buffer.from(chunk).includes(Buffer.from([0x50,0x4b,0x01,0x02]))) {
      cancelled = true; controller.abort(reason);
    }
  } });
  await assert.rejects(exportCache(options(indexedDB, output, 'markdown', { signal: controller.signal })), error => error === reason);
  assert.equal(cancelled, true); assert.equal(output.state.closed, 0); assert.deepEqual(output.state.aborted, [reason]);
  await assertReleased(indexedDB);
});

test('read/write/archive-close/sink-close errors reject, abort once, retain the original error and allow retry', async () => {
  for (const format of ['jsonl','markdown']) for(const failure of ['read','write','close','central-directory']) {
    if(format==='jsonl'&&failure==='central-directory') continue;
    const indexedDB=await fixture([['a',result(body)]]), error=new Error(`${format}-${failure}`);
    const original=IDBObjectStore.prototype.openCursor; const progress=[];
    if(failure==='read') IDBObjectStore.prototype.openCursor=function(...args){ if(this.name==='answers')throw error;return original.apply(this,args);};
    const output=sinkWith({ async write(chunk){if(failure==='write'||(failure==='central-directory'&&Buffer.from(chunk).includes(Buffer.from([0x50,0x4b,0x01,0x02]))))throw error;},
      async close(){if(failure==='close')throw error;},async abort(){throw new Error('abort failure');} });
    try{await assert.rejects(exportCache(options(indexedDB,output,format,{onProgress:p=>{assert.equal(output.state.closed,0,'progress precedes destination close');progress.push(p);}})), e=>e===error);}
    finally{IDBObjectStore.prototype.openCursor=original;}
    assert.deepEqual(output.state.aborted,[error]);
    if(failure==='read'||failure==='write')assert.equal(progress.length,0);
    else {assert.ok(progress.length>0);assert.deepEqual(progress.at(-1),{exported:1,skipped:0});}
    const retry=sinkWith();assert.deepEqual(await exportCache(options(indexedDB,retry,format)),{exported:1,skipped:0});await assertReleased(indexedDB);
  }
});

test('ZIP64 really writes and reopens more than 65535 analysis files', {timeout:300000}, async () => {
  const count=65536, indexedDB=await fixture(Array.from({length:count},(_,i)=>[String(i).padStart(6,'0'),{text:`记录 ${i}`} ]));
  const output=sinkWith();assert.deepEqual(await exportCache(options(indexedDB,output,'markdown')),{exported:count,skipped:0});
  const zip=await unzip(output);assert.equal(zip.entries.length,count+2);
  assert.equal(new Set(zip.entries.map(e=>e.filename)).size,count+2);
  assert.ok(output.bytes().includes(Buffer.from([0x50,0x4b,0x06,0x06])),'actual ZIP64 end-of-directory record');
  assert.equal(zip.entries[1].filename,`analysis-${hash('000000')}.md`);
  assert.equal(zip.entries.at(-2).filename,`analysis-${hash('065535')}.md`);
  assert.ok((await zip.text(zip.entries[1])).includes('记录 0'));
  assert.ok((await zip.text(zip.entries.at(-2))).includes('记录 65535'));
  assert.equal(JSON.parse(await zip.text(zip.entries.at(-1))).exported,count);
  await zip.reader.close();await assertReleased(indexedDB);
});


test('final progress observer failures and cancellation occur before the destination commit',async()=>{
 for(const format of ['jsonl','markdown'])for(const mode of ['throw','abort']){
  const indexedDB=await fixture(),controller=new AbortController(),reason=new Error(`final-${mode}`),output=sinkWith();
  await assert.rejects(exportCache({...options(indexedDB,output,format),signal:controller.signal,onProgress(){if(mode==='throw')throw reason;controller.abort(reason);}}),error=>error===reason);
  assert.equal(output.state.closed,0);assert.deepEqual(output.state.aborted,[reason]);await assertReleased(indexedDB);
 }
});
