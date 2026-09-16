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

(function(root){
  'use strict';
  const Core=root.CoachDiBookingServerCore,Server=root.CoachDiBookingServer;if(!Core||!Server)return;
  const tracker=Core.tracker(root.sessionStorage),busy=new Set();
  function current(){const user=(typeof coachDiFirebaseApp==='object'?coachDiFirebaseApp:root.coachDiFirebaseApp)?.auth().currentUser;if(!user)throw Error('กรุณาเข้าสู่ระบบอีกครั้ง');return user}
  function hash(value){let result=2166136261;for(const char of String(value)){result^=char.codePointAt(0);result=Math.imul(result,16777619)}return(result>>>0).toString(36)}
  function booking(coachId,athleteId){const rows=[...(typeof state==='object'?(state.allAthleteBookings||state.bookings||[]):[])];return rows.find(item=>item?.coachId===coachId&&item?.athleteId===athleteId)?.id||''}
  function selectedAthleteConversation(){
    if(typeof s41ChatBookings!=='function')return null;
    const query=(document.getElementById('s41ChatSearch')?.value||'').toLowerCase(),rows=s41ChatBookings().filter(item=>typeof s41OtherName!=='function'||s41OtherName(item).toLowerCase().includes(query));
    const nodes=[...document.querySelectorAll('.s41LineConv')],active=document.querySelector('.s41LineConv.active'),index=active?nodes.indexOf(active):0;
    return rows[Math.max(0,index)]||rows[0]||null;
  }
  async function command(action,{coachId,athleteId,bookingId='',messageId='',text=''}){
    const user=current(),payload={action,coachId:String(coachId||''),athleteId:String(athleteId||''),bookingId:String(bookingId||''),messageId:String(messageId||''),text:String(text||'').replace(/\r\n?/g,'\n').trim()};
    const scope=`direct:${action}:${payload.coachId}:${payload.athleteId}:${hash(payload.bookingId+'\n'+payload.messageId+'\n'+payload.text)}`,key=`${user.uid}:${scope}`;if(busy.has(key))return null;
    busy.add(key);try{const requestId=tracker.get(user.uid,scope),result=await Server.call('executeDirectChatCommand',{requestId,...payload});tracker.complete(user.uid,scope);return result}finally{busy.delete(key)}
  }
  async function send(input,coachId,athleteId,bookingId=''){
    const raw=input?.value||'',text=raw.replace(/\r\n?/g,'\n').trim();if(!text||!coachId||!athleteId)return null;
    const button=input?.parentElement?.querySelector('button.s41Send,button.send,button[type="submit"]'),originalDisabled=button?.disabled;if(button)button.disabled=true;
    try{const result=await command('send',{coachId,athleteId,bookingId:bookingId||booking(coachId,athleteId),text});if(input?.value===raw)input.value='';return result}
    catch(error){root.alert('ส่งไม่สำเร็จ: '+Core.errorText(error));return null}
    finally{if(button&&document.body.contains(button))button.disabled=Boolean(originalDisabled)}
  }
  root.CoachDiDirectChatServer={command,send};
  root.s41SendLineMessage=()=>{const input=document.getElementById('s41LineInput'),item=selectedAthleteConversation();if(!item)return null;return send(input,item.coachId,item.athleteId,item.latestBookingId||item.id)};
  root.c50CoachSend=()=>{const input=document.getElementById('c43input'),row=typeof c45Conversations==='function'?c45Conversations().find(item=>item.uid===state.c44chatUser):null;if(!row)return null;return send(input,state.user.uid,row.uid,row.latest?.id||'')};
  root.c50DeleteMessage=async(coachId,athleteId,messageId)=>{if(!root.confirm('ลบข้อความนี้?'))return null;try{return await command('delete',{coachId,athleteId,messageId})}catch(error){root.alert('ลบไม่ได้: '+Core.errorText(error));return null}};
})(window);

(function(root){
  'use strict';
  const Core=root.CoachDiBookingServerCore,Server=root.CoachDiBookingServer;if(!Core||!Server)return;
  const tracker=Core.tracker(root.sessionStorage),busy=new Set();
  function current(){const user=(typeof coachDiFirebaseApp==='object'?coachDiFirebaseApp:root.coachDiFirebaseApp)?.auth().currentUser;if(!user)throw Error('กรุณาเข้าสู่ระบบอีกครั้ง');return user}
  function hash(value){let result=2166136261;for(const char of String(value)){result^=char.codePointAt(0);result=Math.imul(result,16777619)}return(result>>>0).toString(36)}
  function button(input){return input?.parentElement?.querySelector('button[type="submit"],button')||null}
  function status(id,message){const node=id&&document.getElementById(id);if(node)node.textContent=message}
  async function send(threadUid,inputId,statusId){
    const input=document.getElementById(inputId),raw=input?.value||'',message=raw.replace(/\r\n?/g,'\n').trim();if(!message)return null;
    const user=current(),target=String(threadUid||user.uid),scope=`support:${target}:${hash(message)}`,key=`${user.uid}:${scope}`;if(busy.has(key))return null;
    const submit=button(input);busy.add(key);if(submit)submit.disabled=true;status(statusId,'กำลังส่ง…');
    try{const requestId=tracker.get(user.uid,scope),result=await Server.call('sendSupportChatMessage',{requestId,threadUid:target,text:message});tracker.complete(user.uid,scope);if(input?.value===raw)input.value='';status(statusId,'ส่งแล้ว');return result}
    catch(error){status(statusId,'ส่งไม่สำเร็จ ข้อความยังอยู่ กรุณาลองส่งอีกครั้ง');root.alert(Core.errorText(error));return null}
    finally{busy.delete(key);if(submit&&document.body.contains(submit))submit.disabled=false}
  }
  root.CoachDiSupportChatServer={send};
  root.cd395SendSupport=()=>send(null,'cdSupportInput395');
  root.cd395AdminReply=uid=>send(uid,'cdAdminSupportInput395');
  root.c70SendAdminChat=()=>send(typeof state==='object'?state.c70AdminChatUid:null,'c70ChatInput','cdSupportSendStatus');
})(window);
