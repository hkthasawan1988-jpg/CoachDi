(function(root){
  'use strict';
  // Coach Di venue dates and times are in Thailand, independently of the device timezone.
  function startTime(date,time){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))return NaN;
    const value=Date.parse(`${date}T${time}:00+07:00`);
    return Number.isFinite(value)&&new Date(value+7*3600000).toISOString().slice(0,16)===`${date}T${time}`?value:NaN;
  }
  function dateError(date,start,end,now=Date.now()){
    const from=startTime(date,start),to=startTime(date,end);
    if(!Number.isFinite(from)||!Number.isFinite(to))return 'กรุณาระบุวันที่และเวลาให้ครบถ้วน';
    if(from<=now)return 'เลยเวลามาแล้ว กรุณาเลือกวันและเวลาเริ่มคลาสในอนาคต';
    return to<=from?'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มคลาส':'';
  }
  function available(rows,now=Date.now()){
    return (rows||[]).filter(row=>row&&row.id&&row.coachId&&row.status==='open'&&startTime(row.date,row.start)>now&&Number(row.capacity)>Number(row.approvedCount||0))
      .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)||startTime(a.date,a.start)-startTime(b.date,b.start));
  }
  function customers(users){return Object.values(users||{}).filter(user=>user?.role==='athlete').length;}
  function classKey(row){return `${row.coachId}/${row.id}`;}
  const api={startTime,dateError,available,customers,classKey};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CoachDiUpdatesCore=api;
})(typeof window==='undefined'?globalThis:window);
