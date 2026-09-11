const {test}=require('node:test'),assert=require('node:assert/strict');
const {install,owned}=require('../account-session.js');
function fixture(){
  const events=[],waits=[];const raw=path=>({on(event,callback,cancel,context){events.push({path,event,callback,cancel,context});},off(event,callback){events.filter(x=>x.callback===callback).forEach(x=>x.removed=true);},once(){return new Promise((resolve,reject)=>waits.push({resolve,reject}));},orderByChild(){return this;},equalTo(){return this;},child:key=>raw(path+'/'+key)});
  const db={ref:raw},auth={currentUser:null},state={role:null,user:null,bookings:[],notifications:[],availability:{start:6}};
  const session=install(db,auth,state);const login=(uid,role='athlete')=>{auth.currentUser=uid?{uid}:null;session.begin(auth.currentUser);state.user=auth.currentUser;state.role=uid?role:null;};
  return {db,auth,state,session,events,waits,login};
}
test('booking ownership is checked separately for athlete and provider roles',()=>{
  const rows=[{id:'a',athleteId:'same',coachId:'other'},{id:'b',coachId:'same',athleteId:'other'},{id:'c',coachId:'other',athleteId:'third'}];
  assert.deepEqual(owned(rows,'same','athlete').map(x=>x.id),['a']);assert.deepEqual(owned(rows,'same','coach').map(x=>x.id),['b']);assert.deepEqual(owned(rows,'same','admin'),[]);assert.deepEqual(owned(rows,'','coach'),[]);
});
test('switching accounts detaches reads and discards old callbacks even after returning to the old UID',()=>{
  const f=fixture();f.login('a');f.db.ref('bookings').orderByChild('athleteId').equalTo('a').on('value',s=>f.state.bookings=s);
  const late=f.events[0];late.callback([{id:'a'}]);assert.equal(f.state.bookings.length,1);
  f.login('b','coach');assert.equal(late.removed,true);assert.deepEqual(f.state.bookings,[]);late.callback([{id:'leaked'}]);assert.deepEqual(f.state.bookings,[]);
  f.login('a');late.callback([{id:'stale-after-return'}]);assert.deepEqual(f.state.bookings,[]);
});
test('late single reads reject instead of repopulating a different account',async()=>{
  const f=fixture();f.login('a');const pending=f.db.ref('users/a').once('value').then(s=>{f.state.userProfile=s;});f.login('b');f.waits[0].resolve({private:'a'});await assert.rejects(pending,{code:'coach-di/session-changed'});assert.deepEqual(f.state.userProfile,{});
});
test('sign-out clears saved profile, refund details, chat and booking caches',()=>{
  const f=fixture();f.login('a');Object.assign(f.state,{userProfile:{refundAccount:{accountNumber:'0012345678'}},paymentAccount:{accountName:'old'},allAthleteBookings:[{id:'old'}],c69Outgoing:{old:{}},userDisplayName:'Old',c44chatUser:'old',notifications:[{message:'private'}],s40NotifCount:2});f.login(null);
  assert.deepEqual(f.state.userProfile,{});assert.deepEqual(f.state.paymentAccount,{});assert.deepEqual(f.state.allAthleteBookings,[]);assert.deepEqual(f.state.c69Outgoing,{});assert.equal(f.state.userDisplayName,'');assert.equal(f.state.c44chatUser,null);assert.deepEqual(f.state.notifications,[]);assert.equal(f.state.s40NotifCount,0);assert.deepEqual(f.state.availability,{start:6});
});
test('off accepts the original callback and preserves context; unchanged session retains subscriptions',()=>{
  const f=fixture();f.login('a');const ref=f.db.ref('notifications/a'),context={calls:0};function callback(){this.calls++;}assert.equal(ref.on('value',callback,context),callback);f.events[0].callback();assert.equal(context.calls,1);assert.equal(f.session.begin({uid:'a'}),false);assert.equal(f.session.subscriptionCount(),1);ref.off('value',callback,context);assert.equal(f.session.subscriptionCount(),0);assert.equal(f.events[0].removed,true);
});
