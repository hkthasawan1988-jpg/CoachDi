'use strict';
class BookingProofError extends Error{constructor(code,message=code){super(message);this.name='BookingProofError';this.code=code}}
function value(snapshot){return snapshot&&typeof snapshot.val==='function'?snapshot.val():null}
function safePath(kind,booking){
  const proof=kind==='refund'?booking.refundProofStorage:booking.paymentProofStorage;
  const owner=kind==='refund'?booking.coachId:booking.athleteId;
  const folder=kind==='refund'?'refund-slip':'booking-slip';
  const path=String(proof&&proof.path||'');
  if(!owner||!path.startsWith(`private/${folder}/${owner}/`))throw new BookingProofError('PROOF_NOT_FOUND');
  return path;
}
async function execute(db,storage,{actorUid,input,now=Date.now()}){
  const bookingId=String(input&&input.bookingId||'').trim(),kind=String(input&&input.kind||'payment').trim();
  if(!bookingId||!['payment','refund'].includes(kind))throw new BookingProofError('INVALID_PROOF_REQUEST');
  const [bookingSnapshot,userSnapshot]=await Promise.all([db.ref(`bookings/${bookingId}`).get(),db.ref(`users/${actorUid}`).get()]);
  const booking={id:bookingId,...(value(bookingSnapshot)||{})},user=value(userSnapshot)||{};
  if(!booking.coachId)throw new BookingProofError('BOOKING_NOT_FOUND');
  if(user.role!=='admin'&&actorUid!==booking.coachId&&actorUid!==booking.athleteId)throw new BookingProofError('NOT_BOOKING_PARTICIPANT');
  const path=safePath(kind,booking),file=storage.bucket().file(path),[metadata]=await file.getMetadata();
  if(!/^image\/(jpeg|png|webp)$/.test(String(metadata&&metadata.contentType||'')))throw new BookingProofError('PROOF_NOT_FOUND');
  const expiresAt=now+5*60*1000,[url]=await file.getSignedUrl({action:'read',expires:expiresAt});
  return{ok:true,bookingId,kind,url,expiresAt};
}
module.exports={BookingProofError,execute,safePath,value};
