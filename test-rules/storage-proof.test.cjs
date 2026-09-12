'use strict';
const {test,before,after}=require('node:test');const {readFileSync}=require('node:fs');const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');const {ref,uploadBytes,getBytes}=require('firebase/storage');
let env;const file=new Uint8Array([137,80,78,71]);const metadata=uid=>({contentType:'image/png',customMetadata:{ownerUid:uid}});
before(async()=>{if(!process.env.FIREBASE_STORAGE_EMULATOR_HOST?.startsWith('127.0.0.1:'))throw Error('Tests require the isolated Storage emulator');env=await initializeTestEnvironment({projectId:'demo-coach-di-storage',storage:{host:'127.0.0.1',port:9199,rules:readFileSync('storage.rules','utf8')}})});
after(async()=>{if(env)await env.cleanup()});
test('owner uploads a bounded proof and reads it while unrelated users cannot',async()=>{
  const path='private/booking-slip/athlete/request/proof.png',owner=env.authenticatedContext('athlete').storage();
  await assertSucceeds(uploadBytes(ref(owner,path),file,metadata('athlete')));
  await assertSucceeds(getBytes(ref(owner,path)));
  await assertFails(getBytes(ref(env.authenticatedContext('other').storage(),path)));
  await assertSucceeds(getBytes(ref(env.authenticatedContext('admin',{admin:true}).storage(),path)));
});
test('forged ownership, unsupported files and paths outside reviewed folders fail',async()=>{
  const storage=env.authenticatedContext('athlete').storage();
  await assertFails(uploadBytes(ref(storage,'private/booking-slip/other/request/proof.png'),file,metadata('other')));
  await assertFails(uploadBytes(ref(storage,'private/booking-slip/athlete/request/proof.svg'),file,{contentType:'image/svg+xml',customMetadata:{ownerUid:'athlete'}}));
  await assertFails(uploadBytes(ref(storage,'misc/athlete/proof.png'),file,metadata('athlete')));
  await assertFails(uploadBytes(ref(storage,'private/booking-slip/athlete/request/no-owner.png'),file,{contentType:'image/png'}));
});
