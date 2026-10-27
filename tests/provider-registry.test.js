'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Providers=require('../extension/provider-registry.js'),Core=require('../extension/feed-core.js');
const API=require('../extension/api-provider.js'),Build=require('../extension/build-provider.js'),Native=require('../extension/native-provider.js');
function fixture(){
 const calls=[],credentials=[],controller=new AbortController(),authorization={getAccessToken:async()=>{credentials.push('access');return 'invented-access';},onUnauthorized:async rejected=>{credentials.push(['refresh',rejected]);return 'invented-rotated';}};
 const response={text:'Markdown **answer**',provider:'api'},comments={comments:['One','Two','Three']};
 const transport=name=>({publicError:name==='build'?Build.publicError:API.publicError,async run(...args){calls.push({name,method:'run',args});return response;},async generateComments(...args){calls.push({name,method:'comments',args});return comments;}});
 const deps={core:Core,api:transport('api'),build:transport('build'),native:{publicError:Native.publicError,async run(...args){calls.push({name:'x-native',method:'run',args});return response;}}};
 const client={tabId:7,port:{postMessage(){throw Error('Registry never messages a port itself');}}},context={client,signal:controller.signal,onUpdate:()=>{},assertCurrent(){if(controller.signal.aborted)throw controller.signal.reason;},async getApiKey(){credentials.push('key');return 'invented-key';},getOAuthAuthorization(){credentials.push('authorization');return authorization;},async getBuildConnection(){credentials.push('connection');return {port:2419,secret:'invented-local-connection'};}};
 const registry=Providers.create(deps);const request=(provider,task='analysis')=>({post:{id:'1',url:'https://x.com/author/status/1',text:'Claim'},settings:Core.normalizeSettings({provider}),task,analysis:{text:'Prior answer'}});
 return {registry,deps,context,controller,client,calls,credentials,authorization,response,comments,request};
}
test('all four real adapters expose explicit capabilities, model policy, limits and safe error mapping',()=>{
 const h=fixture();assert.deepEqual(Object.keys(h.registry).sort(),['api','build','oauth','x-native']);
 for(const name of ['api','oauth','build'])assert.deepEqual(h.registry[name].capabilities,{analysis:true,comments:true,draft:true});assert.deepEqual(h.registry['x-native'].capabilities,{analysis:true,comments:false,draft:false});
 for(const name of ['api','oauth']){assert.equal(h.registry[name].concurrency({apiConcurrency:99}),8);assert.equal(h.registry[name].concurrency({apiConcurrency:0}),3);assert.equal(h.registry[name].concurrency({apiConcurrency:1}),1);}
 assert.equal(h.registry.build.concurrency({apiConcurrency:8}),1);assert.equal(h.registry['x-native'].concurrency({apiConcurrency:1}),10);assert.equal(h.registry['x-native'].model({apiModel:'grok-imagine-image'}),'fast');
 for(const [name,code] of [['api','NEEDS_KEY'],['build','BUILD_PERMISSION_REQUIRED'],['oauth','OAUTH_LOGIN_REQUIRED'],['x-native','X_NATIVE_UNSUPPORTED']]){const safe=h.registry[name].publicError({code,message:'PRIVATE'});assert.equal(safe.code,code);assert.equal(safe.error.includes('PRIVATE'),false);}
});
for(const provider of ['api','oauth','build','x-native'])for(const task of ['analysis','comments','draft'])test(provider+' '+task+' delegates exactly once or explicitly rejects its capability',async()=>{
 const h=fixture(),request=h.request(provider,task);
 if(provider==='x-native'&&task!=='analysis'){await assert.rejects(h.registry[provider].run(request,h.context),{code:'X_NATIVE_UNSUPPORTED'});assert.equal(h.calls.length,0);assert.deepEqual(h.credentials,[]);return;}
 const value=await h.registry[provider].run(request,h.context);assert.equal(value,task==='comments'?h.comments:h.response);assert.equal(h.calls.length,1);const call=h.calls[0],callbacks=call.args.at(-1);
 assert.equal(call.args[0],request.post);assert.equal(call.args[1],request.settings);assert.equal(callbacks.signal,h.context.signal);
 assert.equal(call.name,provider==='oauth'?'api':provider);assert.equal(call.method,task==='comments'?'comments':'run');
 if(task==='comments')assert.equal(callbacks.analysis,request.analysis);else assert.equal(callbacks.onUpdate,h.context.onUpdate);
 if(provider==='api'){assert.equal(call.args[2],'invented-key');assert.deepEqual(h.credentials,['key']);}
 if(provider==='oauth'){assert.equal(call.args[2],undefined);assert.equal(callbacks.authorization,h.authorization);assert.deepEqual(h.credentials,['authorization']);}
 if(provider==='build'){assert.equal(callbacks.connection.port,2419);assert.deepEqual(h.credentials,['connection']);}
 if(provider==='x-native'){assert.equal(callbacks.client,h.client);assert.deepEqual(h.credentials,[]);}
});
test('OAuth passes lazy credential/refresh callbacks through without eager token acquisition or retries',async()=>{
 const h=fixture();await h.registry.oauth.run(h.request('oauth'),h.context);const auth=h.calls[0].args.at(-1).authorization;assert.deepEqual(h.credentials,['authorization']);assert.equal(await auth.getAccessToken(),'invented-access');assert.equal(await auth.onUnauthorized('rejected-fixture'),'invented-rotated');assert.deepEqual(h.credentials,['authorization','access',['refresh','rejected-fixture']]);assert.equal(h.calls.length,1);
});
for(const provider of ['api','build'])test(provider+' cannot dispatch after an asynchronous credential/permission read becomes cancelled',async()=>{
 const h=fixture();h.context[provider==='api'?'getApiKey':'getBuildConnection']=async()=>{h.controller.abort(new DOMException('Cancelled','AbortError'));return provider==='api'?'invented-key':{port:2419,secret:'invented-local'};};
 await assert.rejects(h.registry[provider].run(h.request(provider),h.context),{name:'AbortError'});assert.equal(h.calls.length,0);
});
test('missing Build permission and OAuth account changes propagate unchanged without API fallback',async()=>{
 for(const [provider,method,code] of [['build','getBuildConnection','BUILD_PERMISSION_REQUIRED'],['oauth','getOAuthAuthorization','OAUTH_ACCOUNT_CHANGED'],['api','getApiKey','NEEDS_KEY']]){const h=fixture(),error=Object.assign(new Error('Fixed refusal'),{code});h.context[method]=()=>{throw error;};await assert.rejects(h.registry[provider].run(h.request(provider),h.context),value=>value===error);assert.equal(h.calls.length,0);}
});
test('transport failures do not trigger another adapter or an automatic replay',async()=>{
 for(const provider of ['api','oauth','build','x-native']){const h=fixture(),error=Object.assign(new Error('Transport failed'),{code:'TIMEOUT'}),transport=provider==='oauth'?h.deps.api:h.deps[provider==='x-native'?'native':provider];let attempts=0;transport.run=async()=>{attempts++;throw error;};await assert.rejects(h.registry[provider].run(h.request(provider),h.context),value=>value===error);assert.equal(attempts,1);assert.equal(h.calls.length,0);}
});
test('nontext API/Build/OAuth selections reject before credentials while native uses Fast independently',async()=>{
 for(const provider of ['api','oauth','build']){const h=fixture(),request=h.request(provider);request.settings.apiModel=request.settings.buildModel=request.settings.oauthModel='grok-imagine-image';await assert.rejects(h.registry[provider].run(request,h.context),{code:'MODEL_UNSUPPORTED'});assert.deepEqual(h.credentials,[]);}
 const h=fixture(),request=h.request('x-native');request.settings.apiModel='grok-imagine-image';await h.registry['x-native'].run(request,h.context);assert.equal(h.calls.length,1);
});
