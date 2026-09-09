(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CoachDiCourtCore=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function monday(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('Invalid date');
    const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error('Invalid date');
    date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10);
  }
  function days(value){const start=new Date(monday(value)+'T12:00:00Z');return Array.from({length:7},(_,i)=>{const date=new Date(start);date.setUTCDate(date.getUTCDate()+i);return date.toISOString().slice(0,10);});}
  function venueLabel(value){
    const name=String(value||'').trim().replace(/\s+/g,' ');
    if(/\bvisda\b/i.test(name))return 'Visda';
    if(/\btropp\b/i.test(name))return 'Tro';
    return name||'สนาม';
  }
  return Object.freeze({monday,days,venueLabel});
});
