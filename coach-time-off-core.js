(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CoachDiTimeOffCore=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
  function range(first,last){if(!validDate(first)||!validDate(last))return null;const [startDate,endDate]=[first,last].sort();return {startDate,endDate,fullDay:true};}
  const inactive=new Set(['cancelled','refunded','rejected_by_coach','declined','expired','cancelled_by_coach','cancelled_by_athlete']);
  const active=row=>row&&!inactive.has(String(row.status||''));
  function normalize(row){
    if(!active(row))return null;
    const startDate=row.startDate||row.date||row.start,endDate=row.endDate||row.date||row.end||startDate;
    if(!validDate(startDate)||!validDate(endDate)||endDate<startDate)return null;
    return {...row,startDate,endDate,fullDay:row.fullDay!==false};
  }
  function hour(value){if(typeof value==='string'&&/^\d{1,2}:\d{2}$/.test(value)){const [h,m]=value.split(':').map(Number);return h+m/60;}return Number(value);}
  function matches(row,date,start=0,end=24){const off=normalize(row);return !!off&&date>=off.startDate&&date<=off.endDate&&(off.fullDay||hour(off.startHour??0)<end&&hour(off.endHour??24)>start);}
  const count=off=>Math.round((Date.parse(off.endDate+'T12:00:00Z')-Date.parse(off.startDate+'T12:00:00Z'))/864e5)+1;
  const conflicts=(off,rows)=>rows.filter(row=>active(row)&&row.date>=off.startDate&&row.date<=off.endDate);
  const intersects=(a,b)=>{const off=normalize(b);return !!off&&a.startDate<=off.endDate&&a.endDate>=off.startDate;};
  return Object.freeze({validDate,range,normalize,matches,count,conflicts,intersects});
});
