'use strict';
const {createHash}=require('node:crypto');
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFile,mkdtemp,mkdir,writeFile,symlink,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os'),{resolve,join,dirname}=require('node:path');
const root=resolve(__dirname,'..');
test('generated entries work as browser globals and CommonJS without transport or DOM dependencies',async()=>{
 const {GENERATED_ENTRIES}=await import('../tools/build-extension.mjs');
 for(const entry of GENERATED_ENTRIES.filter(entry=>!entry.standalone)){const source=await readFile(join(root,entry.output),'utf8');assert.match(source,/^\/\/ GENERATED from src\//);const context=vm.createContext({TextEncoder});vm.runInContext(source,context);assert.equal(typeof context[entry.globalName], 'object');const common=require(join(root,entry.output));assert.deepEqual(Object.keys(common).sort(),Object.keys(context[entry.globalName]).sort());assert.equal(/\beval\(/.test(source),false);}
});
test('exported source includes locked typed dependencies, rebuilds identical entries, and detects drift without writing',async t=>{
 const {inspectSource}=await import('../tools/package-source.mjs'),{buildExtension,GENERATED_ENTRIES}=await import('../tools/build-extension.mjs');
 const exported=await inspectSource(root),directory=await mkdtemp(join(tmpdir(),'superx-typed-source-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const entry of exported.entries){const name=entry.name.slice(entry.name.indexOf('/')+1),file=join(directory,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,entry.data);}
 for(const name of ['src/shared/contracts.ts','src/background/provider-registry.ts','src/background/answer-cache.ts','src/content/feed-scheduler.ts','src/content/math-renderer.ts','tsconfig.json','tools/build-extension.mjs','package-lock.json','tests/types/transport-status.type-test.ts'])await readFile(join(directory,name));
 const pkg=JSON.parse(await readFile(join(directory,'package.json'),'utf8')),lock=JSON.parse(await readFile(join(directory,'package-lock.json'),'utf8'));for(const name of ['typescript','esbuild','katex','@types/chrome','@zip.js/zip.js']){assert.match(pkg.devDependencies[name],/^\d+\.\d+\.\d+$/);assert.equal(lock.packages['node_modules/'+name].version,pkg.devDependencies[name]);assert.equal(lock.packages[''].devDependencies[name],pkg.devDependencies[name]);}
 // Reuse the same locked local toolchain instead of networking for every fixture.
 await symlink(join(root,'node_modules'),join(directory,'node_modules'),process.platform==='win32'?'junction':'dir');
 // A fresh checkout has source/static assets but none of the generated JS.
 for(const entry of GENERATED_ENTRIES)await rm(join(directory,entry.output));
 await assert.rejects(buildExtension({root:directory,check:true}),/Missing runtime script/);
 await buildExtension({root:directory});await buildExtension({root:directory,check:true});
 for(const entry of GENERATED_ENTRIES){const digest=bytes=>createHash('sha256').update(bytes).digest('hex');assert.equal(digest(await readFile(join(directory,entry.output))),digest(await readFile(join(root,entry.output))),entry.output+' must rebuild byte-identically');}
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


test('every first-party runtime has one typed source owner and no hidden handwritten script',async t=>{
 const {inspectScriptOwnership,GENERATED_ENTRIES,VENDOR_SCRIPTS}=await import('../tools/build-extension.mjs');
 const result=await inspectScriptOwnership(root);
 assert.equal(result.scripts.length,result.owners.size+VENDOR_SCRIPTS.length);
 assert.deepEqual([...VENDOR_SCRIPTS],['marked.umd.js','marked-cjk-friendly.umd.js']);
 for(const entry of GENERATED_ENTRIES)assert.match(await readFile(join(root,entry.output),'utf8'),/^\/\/ GENERATED from src\//);
 const directory=await mkdtemp(join(tmpdir(),'superx-owner-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await mkdir(join(directory,'extension'));await symlink(join(root,'src'),join(directory,'src'),'dir');
 for(const name of result.scripts)await writeFile(join(directory,'extension',name),'');
 await writeFile(join(directory,'extension','forgotten.js'),'');
 await assert.rejects(inspectScriptOwnership(directory),/Unowned handwritten runtime: forgotten.js/);
 await rm(join(directory,'extension','forgotten.js'));await mkdir(join(directory,'extension','nested'));await writeFile(join(directory,'extension','nested','forgotten.js'),'');
 await assert.rejects(inspectScriptOwnership(directory),/Unowned handwritten runtime: nested\/forgotten.js/);
});

test('classic runtime build preserves top-level this and forbids accidental runtime modules',async()=>{
 const {classicSource}=await import('../tools/build-extension.mjs'),{transform}=await import('esbuild');
 const value=classicSource('import type {X} from "./x"; export interface A {x:X} export type {}; (function(root){root.same=root===this}).call(this,this);','fixture.ts');
 const output=(await transform(value,{loader:'ts',target:'chrome120'})).code;
 const context=vm.createContext({});vm.runInContext(output,context);assert.equal(context.same,true);
 for(const input of ['import {x} from "./x";','export const x=1;','export {x};'])assert.throws(()=>classicSource(input,'fixture.ts'),/runtime (import|export) forbidden/);
});

test('worker and manifest dependencies load as classic globals in their actual order and stay in separate worlds',async()=>{
 const {webcrypto}=require('node:crypto');
 const context=()=>vm.createContext({TextEncoder,TextDecoder,URL,AbortController,Blob,atob,btoa,setTimeout,clearTimeout,setInterval,clearInterval,crypto:webcrypto});
 const worker=context(),manifest=JSON.parse(await readFile(join(root,'extension/manifest.json'),'utf8'));
 const background=await readFile(join(root,'extension/background.js'),'utf8');
 const imports=background.match(/importScripts\(([^)]+)\)/)[1].match(/"[^"]+"|'[^']+'/g).map(value=>value.slice(1,-1));
 for(const script of imports)vm.runInContext(await readFile(join(root,'extension',script),'utf8'),worker,{filename:script});
 for(const [name,globalName]of Object.entries({'feed-core':'XGrokCore','api-provider':'GrokFirstAPI','native-provider':'SuperXNative','build-acp':'SuperXACP','build-transport':'SuperXBuildTransport','build-provider':'SuperXBuild','build-setup':'SuperXBuildSetup','ui-i18n':'GrokFirstUI','key-store':'SuperXKeyStore','oauth-provider':'SuperXOAuth','history-store':'SuperXHistoryStore'})){
   assert.equal(typeof worker[globalName],'object',name);
   assert.deepEqual(Object.keys(require(join(root,'extension',name+'.js'))).sort(),Object.keys(worker[globalName]).sort());
 }
 const main=context(),isolated=context();
 for(const group of manifest.content_scripts){const world=group.world==='MAIN'?main:isolated;for(const script of group.js||[]){if(script==='content.js')continue;vm.runInContext(await readFile(join(root,'extension',script),'utf8'),world,{filename:script});}}
 assert.equal(typeof main.SuperXNativeProtocol,'object');assert.equal(main.XGrokCore,undefined);
 assert.equal(typeof isolated.SuperXDraftComposer,'object');assert.equal(typeof isolated.GrokFirstMarkdown,'object');assert.equal(isolated.SuperXNativeProtocol,undefined);
});


test('typed sources cannot silence migration failures or replace contracts with any',async()=>{
 const {checkTypedSource}=await import('../tools/build-extension.mjs');
 for(const input of ['type Escape=any;','// @ts-nocheck\nconst x=1;','// @ts-ignore\nconst x=1;','const x=value as unknown as Contract;'])assert.throws(()=>checkTypedSource(input,'fixture.ts'),/forbidden/);
 assert.doesNotThrow(()=>checkTypedSource('const text="any"; interface Boundary {value:unknown}','fixture.ts'));
});
