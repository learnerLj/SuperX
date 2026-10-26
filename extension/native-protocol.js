/* State for one response on an externally owned WebSocket; no transport or UI. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SuperXNativeProtocol=api;
})(globalThis,function(){
  'use strict';
  const MAX_FRAME=2*1024*1024,MAX_TEXT=30000,MAX_SOURCES=20;
  const plain=value=>{
    if(!value||typeof value!=='object')return false;
    const proto=Object.getPrototypeOf(value);
    return proto===null||Object.getPrototypeOf(proto)===null;
  };
  const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=200;
  function create({nonce,prompt,send,emit,randomUUID}){
    // nonce belongs to the outer bridge. Protocol ownership is established by
    // the matching create/request IDs, session and response, not by a nonce.
    let started=false,terminal=false,sessionId='',responseId='';
    let createId='',requestId='',cancelId='',responseSent=false;
    let userCancelled=false,internalError='',cancelAttempted=false,cancelUnconfirmed=false,text='';
    const sources=[],sourceNumbers=new Map();
    const snapshot=()=>sources.map(source=>({...source}));
    function finish(kind,code){
      if(terminal)return;
      terminal=true;
      emit(kind==='RESULT'?{kind,text,sources:snapshot()}:code?{kind,code}:{kind});
    }
    function nextId(){
      let value;try{value=randomUUID();}catch{/* Return only a fixed protocol error. */}
      return id(value)?value:'';
    }
    function transmit(value){try{send(value);}catch{
      if(responseSent){userCancelled=true;unconfirmed();}
      else finish('ERROR','X_NATIVE_INTERRUPTED');
    }}
    function start(){
      if(started||terminal)return;
      started=true;createId=nextId();if(!createId){finish('ERROR','X_NATIVE_PAGE_ERROR');return;}
      transmit({event:{type:'session.create',event_id:createId,session:{model:'fast',x_grok:{
        protocol_capabilities:['conversation_attached','custom_methods_v1','workspace_servers_v1'],
        use_chunk:true,disable_artifact:true,accept_interleaved_phases:true,disabled_connector_ids:[]
      }}}});
    }
    function unconfirmed(){
      if(!cancelUnconfirmed){cancelUnconfirmed=true;emit({kind:'ERROR',code:'X_NATIVE_CANCEL_UNCONFIRMED',retain:true});}
    }
    function cancelResponse(){
      if(!responseId||cancelAttempted||terminal)return;
      cancelAttempted=true;cancelId=nextId();if(!cancelId){unconfirmed();return;}
      transmit({session_id:sessionId,event:{type:'response.cancel',event_id:cancelId,response_id:responseId}});
    }
    function responseError(code){
      if(terminal||internalError)return;
      internalError=code;
      if(!responseSent)finish('ERROR',code);else cancelResponse();
    }
    function cancel(){
      if(terminal||userCancelled)return;
      userCancelled=true;
      if(!responseSent)finish(internalError?'ERROR':'CLOSED',internalError||undefined);
      else cancelResponse();
    }
    function disconnect(){
      if(terminal)return;
      finish(userCancelled?'CLOSED':'ERROR',userCancelled?undefined:'X_NATIVE_INTERRUPTED');
    }
    function serverError(event){
      if(!plain(event.error))return;
      const reference=event.error.event_id;
      if(cancelId&&reference===cancelId&&responseId){
        unconfirmed();
      }else if(!responseId&&(reference===createId||requestId&&reference===requestId)){
        if(userCancelled&&!internalError)finish('CLOSED');
        else finish('ERROR',internalError||'X_NATIVE_PAGE_ERROR');
      }
    }
    function chunk(value){
      if(!plain(value)||userCancelled||internalError)return;
      // Reasoning/notetaker text and any citations carried with it are private
      // to that other channel. Citation-only chunks have no text channel.
      if(plain(value.text)&&value.text.channel!=='CHANNEL_ASSISTANT_RESPONSE')return;
      let delta=plain(value.text)&&typeof value.text.text==='string'?value.text.text:'';
      let source,number;
      if(Object.hasOwn(value,'render_citation')){
        const raw=value.render_citation?.url;
        let url;
        if(typeof raw==='string'&&raw.length<=2048){
          try{const parsed=new URL(raw);if(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password&&parsed.href.length<=2048)url=parsed;}catch{/* Invalid citations must fail the response. */}
        }
        if(!url){responseError('X_NATIVE_CITATION_UNAVAILABLE');return;}
        number=sourceNumbers.get(url.href);
        if(!number){
          if(sources.length>=MAX_SOURCES){responseError('X_NATIVE_CITATION_UNAVAILABLE');return;}
          number=sources.length+1;source={url:url.href,title:url.hostname};
        }
        delta+='[['+number+']](<'+url.href+'>)';
      }
      if(!delta)return;
      if(text.length+delta.length>MAX_TEXT){responseError('X_NATIVE_RESPONSE_LIMIT');return;}
      if(source){sources.push(source);sourceNumbers.set(source.url,number);}
      text+=delta;emit({kind:'UPDATE',text,sources:snapshot()});
    }
    function receive(data){
      if(!started||terminal)return;
      if(typeof data==='string'){
        if(data.length>MAX_FRAME||new TextEncoder().encode(data).length>MAX_FRAME){responseError('X_NATIVE_RESPONSE_LIMIT');return;}
        try{data=JSON.parse(data);}catch{return;}
      }
      if(!plain(data)||!plain(data.event))return;
      const event=data.event;
      if(event.type==='error'){serverError(event);return;}
      if(event.type==='session.created'){
        if(!sessionId&&event.client_event_id===createId&&id(data.session_id)){
          if(event.session?.model&&event.session.model!=='fast'){finish('ERROR','X_NATIVE_PAGE_ERROR');return;}
          sessionId=data.session_id;
        }
        return;
      }
      if(!sessionId||data.session_id!==sessionId)return;
      if(event.type==='conversation.attached'){
        if(responseSent)return;
        requestId=nextId();if(!requestId){finish('ERROR','X_NATIVE_PAGE_ERROR');return;}
        const messageId=nextId();if(!messageId){finish('ERROR','X_NATIVE_PAGE_ERROR');return;}
        responseSent=true;
        transmit({session_id:sessionId,event:{type:'response.create',event_id:requestId,item:{type:'message',role:'user',
          content:[{type:'input_text',text:prompt}],x_grok:{client_message_id:messageId}}}});
      }else if(event.type==='response.created'){
        if(!responseSent||responseId||event.client_event_id!==requestId||!plain(event.response)||!id(event.response.id)||event.response.status!=='in_progress')return;
        responseId=event.response.id;
        if(userCancelled||internalError)cancelResponse();
      }else if(event.type==='response.chunk'){
        if(responseId&&event.response_id===responseId)chunk(event.chunk);
      }else if(event.type==='response.done'){
        if(!responseId||!plain(event.response)||event.response.id!==responseId||!['completed','incomplete','failed'].includes(event.response.status))return;
        if(internalError)finish('ERROR',internalError);
        else if(userCancelled)finish('CLOSED');
        else if(event.response.status==='completed')finish(text.trim()?'RESULT':'ERROR',text.trim()?undefined:'X_NATIVE_PAGE_ERROR');
        else finish('ERROR',event.response.status==='incomplete'?'X_NATIVE_INTERRUPTED':'X_NATIVE_PAGE_ERROR');
      }
      // output_text.done/output_item.done are empty in the observed protocol;
      // neither those events nor tool_result/ui_layout supply assistant text.
    }
    return {start,receive,cancel,disconnect,isTerminal:()=>terminal};
  }
  return {create};
});
