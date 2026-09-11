'use strict';
const {createHash}=require('node:crypto');
const command=require('./booking-command.cjs');
const availability=require('./booking-availability.cjs');

const ID=/^[A-Za-z0-9_-]{8,80}$/;
const MODES=new Set(['request','paid_transfer','venue']);
function text(value,max=120){return String(value==null?'':value).trim().slice(0,max)}
function bookingId(actorUid,requestId){const key=command.commandKey(actorUid,requestId);return key?`BK_${createHash('sha256').update(key).digest('hex').slice(0,20).toUpperCase()}`:null}
function requestFingerprint(actorUid,input={}){
  const canonical={actorUid:text(actorUid,80),coachId:text(input.coachId,80),date:text(input.date,10),start:String(input.start??''),durationMinutes:String(input.durationMinutes??60),venueId:text(input.venueId,120),venueName:text(input.venueName,120),participants:String(input.participants??1),paymentMode:text(input.paymentMode,30),proofPath:text(input.paymentProof?.path,240),proofSize:String(input.paymentProof?.size??''),proofType:text(input.paymentProof?.contentType,80)};
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
function privateProof(actorUid,proof){
  if(!proof||typeof proof!=='object')return null;
  const path=text(proof.path,240),url=text(proof.url,2048),contentType=text(proof.contentType,80),size=Number(proof.size);
  if(!path.startsWith(`private/booking-slip/${actorUid}/`)||!/^image\/(jpeg|png|webp)$/.test(contentType)||!Number.isSafeInteger(size)||size<=0||size>10*1024*1024)return null;
  if(!/^https:\/\/firebasestorage\.googleapis\.com\//.test(url))return null;
  return{path,url,contentType,size,name:text(proof.name,120),uploadedAt:Number(proof.uploadedAt)||null};
}
function priceFor(pricing,durationMinutes){const key=`p${durationMinutes}`,price=Number(pricing&&pricing[key]);return Number.isSafeInteger(price)&&price>=0&&price<=20000000?price:null}
function evaluate({actorUid,athlete,coach,pricing,paymentAccount,input,now}){
  const requestId=text(input&&input.requestId,80),coachId=text(input&&input.coachId,80),id=bookingId(actorUid,requestId);
  if(!id||!ID.test(coachId))return{ok:false,code:'INVALID_REQUEST_ID'};
  if(!athlete||athlete.role!=='athlete'||athlete.status==='suspended')return{ok:false,code:'ATHLETE_INACTIVE'};
  if(!command.coachEligible(coach,now))return{ok:false,code:'COACH_INACTIVE'};
  const mode=text(input.paymentMode,30);if(!MODES.has(mode))return{ok:false,code:'INVALID_PAYMENT_MODE'};
  const durationMinutes=Number(input.durationMinutes??60),start=Number(input.start),end=start+durationMinutes/60;
  if(![60,90,120].includes(durationMinutes))return{ok:false,code:'INVALID_DURATION'};
  const target={id,date:text(input.date,10),start,end,venueId:text(input.venueId,120),venue:text(input.venueName,120)};
  const windowCheck=availability.evaluate(target,{}, {now,mandatoryBufferMinutes:0,unknownTravelMinutes:0,maxClassesPerDay:99});
  if(!windowCheck.ok)return{ok:false,code:windowCheck.code};
  if(!target.venueId||target.venue.length<2)return{ok:false,code:'INVALID_VENUE'};
  const participants=Number(input.participants??1);if(!Number.isInteger(participants)||participants<1||participants>20)return{ok:false,code:'INVALID_PARTICIPANTS'};
  const priceSatang=priceFor(pricing,durationMinutes);if(priceSatang==null)return{ok:false,code:'PRICE_UNAVAILABLE'};
  const proof=privateProof(actorUid,input.paymentProof);
  if(mode==='paid_transfer'&&(!proof||paymentAccount?.verificationStatus!=='approved'))return{ok:false,code:proof?'PAYMENT_ACCOUNT_UNAVAILABLE':'PAYMENT_EVIDENCE_REQUIRED'};
  const key=command.commandKey(actorUid,requestId);
  return{ok:true,bookingId:id,commandKey:key,coachId,mode,durationMinutes,participants,priceSatang,platformFeeSatang:mode==='request'?4500:0,proof,target};
}
function record(decision,{actorUid,athlete,input,now}){
  if(!decision.ok)throw Error('Cannot create a rejected booking');
  const paid=decision.mode==='paid_transfer',venue=decision.mode==='venue';
  const booking={
    coachId:decision.coachId,athleteId:actorUid,athlete:text(athlete.displayName||athlete.name||athlete.email||'Athlete',120),athleteEmail:text(athlete.email,180),phone:text(athlete.phone,40),
    date:decision.target.date,start:decision.target.start,end:decision.target.end,venueId:decision.target.venueId,venue:decision.target.venue,
    status:paid?'payment_submitted':'pending_coach_approval',approvalStatus:'pending',paymentStatus:paid?'payment_submitted':venue?'pay_at_venue_pending':'not_started',
    participants:decision.participants,pricePerPersonSatang:decision.priceSatang,priceSatang:decision.priceSatang,travelFeeSatang:0,platformFeeSatang:decision.platformFeeSatang,
    priceSnapshot:{durationMinutes:decision.durationMinutes,priceSatang:decision.priceSatang},createCommandKey:decision.commandKey,createdAt:now,updatedAt:now,
  };
  if(venue){booking.paymentCollectionMode='venue';booking.courtConfirmed=true;booking.courtConfirmedByAthleteAt=now}
  if(paid){booking.courtConfirmed=true;booking.courtConfirmedByAthleteAt=now;booking.paymentProofStorage={path:decision.proof.path,name:decision.proof.name,size:decision.proof.size,contentType:decision.proof.contentType,uploadedAt:decision.proof.uploadedAt||now};booking.paymentSubmittedAt=now}
  return booking;
}
function same(current,expected){return !!current&&current.createCommandKey===expected.createCommandKey&&current.athleteId===expected.athleteId&&current.coachId===expected.coachId&&current.date===expected.date&&Number(current.start)===Number(expected.start)&&Number(current.end)===Number(expected.end)&&Number(current.priceSatang)===Number(expected.priceSatang)}
module.exports={bookingId,evaluate,privateProof,priceFor,record,requestFingerprint,same,text};
