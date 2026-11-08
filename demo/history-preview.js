(function() {
  'use strict';
  // Isolated local preview. These synthetic records never touch extension
  // storage, accounts, API Keys or the network.
  const query = new URLSearchParams(location.search),runtimeListeners = [],storageListeners = [];
  let language = GrokFirstUI.normalizeLanguage(query.get('lang') || 'en');
  let settings = XGrokCore.normalizeSettings({apiVerification:'only',interfaceLanguage:query.get('interface') || 'auto'});
  let epoch = 0;
  const current = Date.now();
  const factCheck = '**Insufficient evidence.** The chart omits its data source, sample and evaluation conditions. An original report and independent test results would be needed to support broader conclusions.\n\n*Saved local Fact Check preview; no sources were actually searched.*';
  const answer = (index, extra) => ({index,provider:'api',account:'',model:'grok-4.3',completedAt:current-280000,text:factCheck,sources:[],verificationStatus:'complete',usage:{input_tokens:850,output_tokens:384,total_tokens:1234},usageComplete:true,...extra});
  let records = query.get('history-state') === 'empty' ? [] : [
    {id:'10001',url:'https://x.com/example/status/10001',hasSnapshot:true,author:'Example · @example',text:'A useful idea deserves its full context.\n\nWhat does this chart actually show?',activityAt:current-280000,preferred:0,
      answers:[answer(0),answer(1,{provider:'x-native',model:'x-web',completedAt:current-3600000,text:'**Older native answer.** The chart has no stated source.',usage:undefined,usageComplete:false})],
      comments:['The original source would help clarify what this chart measures.','Which sample and time period does the chart cover?','I would separate the pattern in the chart from a claim about causation.']},
    {id:'10003',url:'https://x.com/demo/status/10003',hasSnapshot:true,author:'Demo · @demo',text:'Saved answers may contain code samples from a source.',activityAt:current-7200000,preferred:0,
      answers:[answer(0,{completedAt:current-7200000,verificationStatus:'incomplete',text:'**Check incomplete.** The following code is displayed as text and is not executed:\n\n```js\nconst message = "<img src=x onerror=alert(1)>";\n```'})],comments:[]},
    {id:'10004',url:'https://x.com/legacy/status/10004',hasSnapshot:false,author:'',text:'',activityAt:current-86400000*3,preferred:0,
      answers:[answer(0,{completedAt:current-86400000*3,text:'**Cached before records existed.** The original post text was not saved.'})],comments:[]},
  ];
  if (query.get('history-state') === 'large') records = Array.from({length:1000},(_,index) => ({
    id:String(20000+index),url:`https://x.com/example/status/${20000+index}`,hasSnapshot:true,author:`Example ${index+1} · @example`,
    text:`Synthetic checked post ${index+1}. ` + 'A local records preview contains no real posts or credentials. '.repeat(35) + (index === 999 ? '\nUnique last-page phrase.' : ''),
    activityAt:current-index*1000-1000,preferred:0,comments:[],
    answers:[answer(0,{completedAt:current-index*1000-1000,text:'**Synthetic saved answer.**\n\n' + 'Read the full context and original evidence before reaching a conclusion. '.repeat(48)})],
  }));
  const limitBytes = 1024 * 1024 * 1024;
  const level = query.get('usage');
  const bytes = () => level ? Math.round(limitBytes * Number(level) / 100) : records.length * 6000;
  const usage = () => ({ok:true,epoch,bytes:bytes(),limitBytes,records:records.length,answers:records.reduce((sum,record)=>sum+record.answers.length,0)});
  const page = message => {
    const needle = String(message.query || '').toLowerCase();
    const matches = records.filter(record => !needle || [record.text,record.author,...record.answers.map(item=>item.text)].some(value=>String(value).toLowerCase().includes(needle)));
    const start = Array.isArray(message.after) ? matches.findIndex(record => record.id === message.after[1]) + 1 : 0;
    const items = matches.slice(start,start+50),last = items[items.length-1];
    return {ok:true,epoch,records:structuredClone(items),next:start+50 < matches.length && last ? [last.activityAt,last.id] : null};
  };
  const changed = bump => {if (bump) epoch++;for (const listener of runtimeListeners) listener({type:'HISTORY_CHANGED',epoch});};
  window.SuperXHistoryPreview = {updateAnswer(id,text) {
    const record=records.find(value=>value.id===id);if(!record)return;
    record.answers[0]={...record.answers[0],text};changed(false);
  }};
  window.chrome = {
    runtime:{
      getManifest:() => ({version:'0.9.10-preview'}),
      onMessage:{addListener:listener => runtimeListeners.push(listener)},
      async sendMessage(message) {
        if (message.type === 'GET_UI_LANGUAGE') return {ok:true,language};
        if (message.type === 'GET_CONFIG') return {ok:true,ready:false,settings};
        if (message.type === 'GET_RECORDS') return page(message);
        if (message.type === 'GET_CACHE_USAGE') return usage();
        if (message.type === 'DELETE_HISTORY') { if (query.get('history-state') === 'error') return {ok:false};records = records.filter(record => record.id !== message.id);changed(true);return {ok:true,epoch}; }
        if (message.type === 'CLEAR_HISTORY') { if (query.get('history-state') === 'error') return {ok:false};records = [];changed(true);return {ok:true,epoch}; }
        return {ok:false};
      },
    },
    storage:{
      local:{async get() { return {uiLanguage:language}; }},
      onChanged:{addListener:listener => storageListeners.push(listener)},
    },
  };
  const banner = document.createElement('div');banner.id = 'preview-note';banner.textContent = 'Local fact-check records preview · Synthetic records · No API requests';
  banner.style.cssText = 'margin:0;padding:8px 16px;text-align:center;font:12px/1.5 system-ui;color:var(--muted,#71767b);background:var(--background,#000);border-bottom:1px solid var(--line,#2f3336)';
  document.body.prepend(banner);
})();
