'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFile,mkdtemp,mkdir,writeFile,symlink,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os'),{resolve,join,dirname}=require('node:path');
const root=resolve(__dirname,'..');
test('generated entries work as browser globals and CommonJS without transport or DOM dependencies',async()=>{
 const {GENERATED_ENTRIES}=await import('../tools/build-extension.mjs');
 for(const entry of GENERATED_ENTRIES){const source=await readFile(join(root,entry.output),'utf8');assert.match(source,/^\/\/ GENERATED from src\//);const context=vm.createContext({TextEncoder});vm.runInContext(source,context);assert.equal(typeof context[entry.globalName], 'object');const common=require(join(root,entry.output));assert.deepEqual(Object.keys(common).sort(),Object.keys(context[entry.globalName]).sort());assert.equal(/\beval\(/.test(source),false);}
});
test('exported source includes locked typed dependencies, rebuilds identical entries, and detects drift without writing',async t=>{
 const {inspectSource}=await import('../tools/package-source.mjs'),{buildExtension,GENERATED_ENTRIES}=await import('../tools/build-extension.mjs');
 const exported=await inspectSource(root),directory=await mkdtemp(join(tmpdir(),'superx-typed-source-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const entry of exported.entries){const name=entry.name.slice(entry.name.indexOf('/')+1),file=join(directory,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,entry.data);}
 for(const name of ['src/shared/contracts.ts','src/background/provider-registry.ts','src/background/answer-cache.ts','src/content/feed-scheduler.ts','src/content/math-renderer.ts','tsconfig.json','tools/build-extension.mjs','package-lock.json','tests/types/transport-status.type-test.ts'])await readFile(join(directory,name));
 const pkg=JSON.parse(await readFile(join(directory,'package.json'),'utf8')),lock=JSON.parse(await readFile(join(directory,'package-lock.json'),'utf8'));for(const name of ['typescript','esbuild','katex']){assert.match(pkg.devDependencies[name],/^\d+\.\d+\.\d+$/);assert.equal(lock.packages['node_modules/'+name].version,pkg.devDependencies[name]);assert.equal(lock.packages[''].devDependencies[name],pkg.devDependencies[name]);}
 // Reuse the same locked local toolchain instead of networking for every fixture.
 await symlink(join(root,'node_modules'),join(directory,'node_modules'),process.platform==='win32'?'junction':'dir');
 await buildExtension({root:directory,check:true});await buildExtension({root:directory});
 for(const entry of GENERATED_ENTRIES)assert.deepEqual(await readFile(join(directory,entry.output)),await readFile(join(root,entry.output)));
 const target=join(directory,'extension/feed-scheduler.js'),before=await readFile(target),file=join(directory,'src/content/feed-scheduler.ts');await writeFile(file,(await readFile(file,'utf8')).replace('Math.trunc(options.count)','Math.trunc(options.count)-1'));
 await assert.rejects(buildExtension({root:directory,check:true}),/Generated output drift: extension\/feed-scheduler.js/);assert.deepEqual(await readFile(target),before,'--check must not silently regenerate');
 await buildExtension({root:directory});assert.notDeepEqual(await readFile(target),before);await buildExtension({root:directory,check:true});
});

test('generated math bundle escapes Chrome-rejected Unicode noncharacters',async()=>{
 const source=await readFile(join(root,'extension/math-renderer.js'));
 const text=new TextDecoder('utf-8',{fatal:true}).decode(source);
 for(const character of text){const point=character.codePointAt(0);assert.ok(!(point>=0xfdd0&&point<=0xfdef)&&((point&0xffff)<0xfffe),'Escape noncharacter regex sentinels rather than embedding them in source');}
 assert.ok(text.includes('\\uFFFF')||text.includes('\\uffff'));
});
