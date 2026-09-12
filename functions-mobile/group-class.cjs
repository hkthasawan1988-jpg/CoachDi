'use strict';

const crypto=require('node:crypto');
const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const ACTIONS=new Set(['create','update_schedule','set_status','submit_paid','decide','reconcile_income']);

function text(value,max=120){const result=String(value||'').trim();return result&&result.length<=max?result:null}
function validId(value){const result=String(value||'').trim();return /^[A-Za-z0-9_-]{4,120}$/.test(result)?result:null}
function validRequestId(value){const result=String(value||'').trim();return /^[A-Za-z0-9_-]{8,180}$/.test(result)?result:null}
function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const date=new Date(`${value}T12:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value}
function validTime(value){if(!/^\d{2}:\d{2}$/.test(value||''))return false;const[h,m]=value.split(':').map(Number);return h>=0&&h<=23&&m>=0&&m<=59}
function future(date,start,now){return validDate(date)&&validTime(start)&&Date.parse(`${date}T${start}:00+07:00`)>Number(now)}
function subscribed(user,now){const end=Number(user?.subscription?.currentPeriodEndsAt||user?.subscription?.trialEndsAt||0);return user?.role==='coach'&&user?.status==='active'&&end>0&&Number(now)<=end+259200000}
function classId(actorUid,requestId){const actor=validId(actorUid),request=validRequestId(requestId);if(!actor||!request)return null;return `GC_${crypto.createHash('sha256').update(`${actor}\n${request}`).digest('hex').slice(0,20).toUpperCase()}`}
function fingerprint(actorUid,input){const fields={actorUid,action:String(input?.action||''),classId:String(input?.classId||''),athleteId:String(input?.athleteId||''),decision:String(input?.decision||''),status:String(input?.status||''),title:String(input?.title||''),sport:String(input?.sport||''),capacity:Number(input?.capacity||0),date:String(input?.date||''),start:String(input?.start||''),end:String(input?.end||''),venueName:String(input?.venueName||''),priceSatang:Number(input?.priceSatang||0),note:String(input?.note||''),proofPath:String(input?.paymentProof?.path||'')};return crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex')}
function proof(value,athleteId){const path=String(value?.path||''),name=text(value?.name,120),contentType=String(value?.contentType||''),size=Number(value?.size),uploadedAt=Number(value?.uploadedAt);if(!path.startsWith(`private/group-class-slip/${athleteId}/`)||!name||!IMAGE_TYPES.has(contentType)||!Number.isSafeInteger(size)||size<=0||size>10*1048576||!Number.isFinite(uploadedAt)||uploadedAt<=0)return null;return{path,name,size,contentType,uploadedAt}}
function legacyProof(value){const data=String(value||'');return data.length>100&&data.length<=5000000&&(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)||data.startsWith('https://firebasestorage.googleapis.com/'))}
function createInput(input,now){const title=text(input?.title,100),sport=text(input?.sport,40),venueName=text(input?.venueName,120),note=String(input?.note||'').trim(),capacity=Number(input?.capacity),priceSatang=Number(input?.priceSatang),date=String(input?.date||''),start=String(input?.start||''),end=String(input?.end||'');if(!title||title.length<2||!sport||sport.length<2||!venueName||venueName.length<2||note.length>500||!Number.isInteger(capacity)||capacity<2||capacity>50||!Number.isSafeInteger(priceSatang)||priceSatang<100||priceSatang>1000000||!future(date,start,now)||!validTime(end)||end<=start)return null;return{title,sport,venueName,note,capacity,priceSatang,date,start,end}}
function scheduleInput(input,now){const venueName=text(input?.venueName,120),date=String(input?.date||''),start=String(input?.start||''),end=String(input?.end||'');return venueName&&venueName.length>=2&&future(date,start,now)&&validTime(end)&&end>start?{venueName,date,start,end}:null}
function action(input){const value=String(input?.action||'');return ACTIONS.has(value)?value:null}

module.exports={ACTIONS,action,classId,createInput,fingerprint,future,legacyProof,proof,scheduleInput,subscribed,text,validDate,validId,validRequestId,validTime};
