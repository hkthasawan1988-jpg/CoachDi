(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CoachDiAccountSession=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  function owned(rows,uid,role){
    if(!uid||!['athlete','coach'].includes(role))return [];
    const key=role==='coach'?'coachId':'athleteId',seen=new Set();
    return (rows||[]).filter(row=>row&&row[key]===uid&&!seen.has(row.id)&&seen.add(row.id));
  }
  function install(db,auth,state){
    const defaults=clone(state),originalRef=db.ref.bind(db),subscriptions=new Set();
    let owner,epoch=0;
    const stale=()=>Object.assign(new Error('Account changed; old response discarded'),{code:'coach-di/session-changed'});
    function scope(){const uid=auth.currentUser?.uid||'',generation=epoch,role=state.role;return ()=>generation===epoch&&(auth.currentUser?.uid||'')===uid&&(!role||state.role===role);}
    function wrap(raw,key){
      return new Proxy(raw,{get(target,property){
        if(property==='on')return function(event,callback,cancelOrContext,context){
          const current=scope(),ctx=typeof cancelOrContext==='function'?context:cancelOrContext;
          const handler=(...args)=>{if(current())return callback.apply(ctx,args);};
          const cancel=typeof cancelOrContext==='function'?((...args)=>{if(current())return cancelOrContext.apply(ctx,args);}):undefined;
          const record={raw,key,event,callback,handler,context:ctx};subscriptions.add(record);
          try{raw.on(event,handler,cancel,ctx);}catch(error){subscriptions.delete(record);throw error;}return callback;
        };
        if(property==='off')return function(event,callback,context){
          for(const record of [...subscriptions])if(record.key===key&&(!event||record.event===event)&&(!callback||record.callback===callback)&&(context===undefined||record.context===context)){
            record.raw.off(record.event,record.handler,record.context);subscriptions.delete(record);
          }
        };
        if(property==='once'||property==='get')return function(event,success,failure,context){
          const current=scope();
          const promise=property==='get'?raw.get():raw.once(event);
          return Promise.resolve(promise).then(value=>{if(!current())throw stale();if(typeof success==='function')success.call(context,value);return value;},error=>{if(!current())throw stale();if(typeof failure==='function')failure.call(context,error);throw error;});
        };
        if(['child','orderByChild','orderByKey','orderByValue','orderByPriority','equalTo','startAt','startAfter','endAt','endBefore','limitToFirst','limitToLast'].includes(property))return (...args)=>wrap(raw[property](...args),key+'/'+property+JSON.stringify(args));
        if(property==='parent'||property==='root'){const value=Reflect.get(target,property,target);return value?wrap(value,String(value)):value;}
        const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
      }});
    }
    db.ref=path=>wrap(originalRef(path),String(path||''));
    function begin(user,force=false){
      const uid=user?.uid||'';if(owner===uid&&!force)return false;owner=uid;epoch++;
      for(const record of subscriptions){try{record.raw.off(record.event,record.handler,record.context);}catch(_){}}subscriptions.clear();
      // Release legacy modules' cached query handles as well as the underlying subscriptions.
      if(typeof window==='object')for(const name of ['c69AdminStopWatch','c71UnbindPublic','c72UnbindKnockerQueue','c73UnbindOwn','c75StopAdminQueue','c76StopCoachClasses','c76StopCoachRequests','c76StopAthleteClasses','c80Stop','c94Stop'])try{window[name]?.();}catch(_){}
      for(const key of Object.keys(state)){
        const value=state[key];
        if(value&&typeof value==='object')state[key]=Object.hasOwn(defaults,key)?clone(defaults[key]):Array.isArray(value)?[]:{};
        else if(typeof value==='boolean')state[key]=defaults[key]??false;
        else if(/(?:unread|notifCount|DisplayName|userName|userEmail|userPhoto|chat|thread|bookingId|Uid$)/i.test(key))state[key]=typeof value==='number'?0:typeof value==='string'?'':null;
      }
      Object.assign(state,{user:null,role:null,coachId:null,pilotCoachId:null,selectedCell:null,bookings:[],allAthleteBookings:[],s42CoachBookings:[],notifications:[],s40NotifCount:0,userProfile:{},coachProfile:{},subscription:{},subscriptionLocked:false,c43p:'overview',s42Page:'overview',c44chatUser:null,c43chat:null,c50MyTab:'pending',c72DirectCoach:null});
      if(typeof document==='object'){
        for(const id of ['coachContent','sidebar','mobileNav','athleteBookings','selectedCoachIdentity'])document.getElementById(id)?.replaceChildren();
        for(const id of ['s40AthleteDynamic','c47Home','c69PartnerHost','c76AthleteHost','cdDirectProvider','cdProviderShare','c69Modal','c76Modal','c91Guide','cdAthleteGuide','cdSupportFloat395'])document.getElementById(id)?.remove();
        try{window.closeSheet?.();window.c92CloseAllMenu?.();window.c91CloseGuide?.();}catch(_){}
        document.body.classList.remove('bo-knocker-provider');
        document.dispatchEvent(new CustomEvent('coachdi:account-reset',{detail:{uid}}));
      }
      return true;
    }
    if(typeof window==='object')window.addEventListener('unhandledrejection',event=>{if(event.reason?.code==='coach-di/session-changed')event.preventDefault();});
    return {begin,owned,subscriptionCount:()=>subscriptions.size};
  }
  return {install,owned};
});
