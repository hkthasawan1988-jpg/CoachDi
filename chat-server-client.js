(function(root){
  'use strict';
  const Core=root.CoachDiBookingServerCore,Server=root.CoachDiBookingServer;if(!Core||!Server)return;
  const tracker=Core.tracker(root.sessionStorage),busy=new Set();
  function current(){const user=(typeof coachDiFirebaseApp==='object'?coachDiFirebaseApp:root.coachDiFirebaseApp)?.auth().currentUser;if(!user)throw Error('กรุณาเข้าสู่ระบบอีกครั้ง');return user}
  function hash(value){let result=2166136261;for(const char of String(value)){result^=char.codePointAt(0);result=Math.imul(result,16777619)}return(result>>>0).toString(36)}
  function button(input){return input?.parentElement?.querySelector('button')||null}
  async function send(bookingId,inputId){
    const input=document.getElementById(inputId),message=(input?.value||'').replace(/\r\n?/g,'\n').trim();if(!message||!bookingId)return null;
    const user=current(),scope=`chat:${bookingId}:${hash(message)}`,key=`${user.uid}:${scope}`;if(busy.has(key))return null;
    const submit=button(input);busy.add(key);if(submit)submit.disabled=true;
    try{const requestId=tracker.get(user.uid,scope),result=await Server.call('sendBookingChatMessage',{requestId,bookingId,text:message});tracker.complete(user.uid,scope);if(input)input.value='';return result}
    catch(error){root.alert(Core.errorText(error));return null}
    finally{busy.delete(key);if(submit&&document.body.contains(submit))submit.disabled=false}
  }
  function lexical(name){try{return typeof root[name]==='string'?root[name]:null}catch(_){return null}}
  root.CoachDiChatServer={send};
  root.cdSendChat=id=>send(id,'cdChatInput');
  root.c43send=()=>send(typeof state==='object'?state.c43chat:null,'c43input');
  root.cd396SendChat=()=>send(lexical('cd396ChatBookingId')||(typeof cd396ChatBookingId!=='undefined'?cd396ChatBookingId:null),'cd396ChatInput');
  root.cd398SendMessage=()=>send(lexical('cd398ChatBookingId')||(typeof cd398ChatBookingId!=='undefined'?cd398ChatBookingId:null),'cd398ChatInput');
  root.s40SendMessage=()=>send(lexical('s40ChatBookingId')||(typeof s40ChatBookingId!=='undefined'?s40ChatBookingId:null),'s40ChatInput');
})(window);
