const {test,expect}=require('@playwright/test');
const {openIsolatedApp}=require('./helpers/app');
async function athleteHome(page){
  await page.evaluate(()=>{
    state.role='athlete';state.user={uid:'footer-athlete'};testAuth.currentUser=state.user;
    localStorage.setItem('coachDiLocationConsent','denied');
    state.coaches=[{uid:'coach',displayName:'โค้ชทดสอบ'}];
    state.allAthleteBookings=[{id:'b',coachId:'coach',athleteId:state.user.uid,coachName:'โค้ชทดสอบ',date:TODAY,start:10,end:11,venue:'สนามทดสอบ',status:'confirmed'}];
    testRealtimeValues={'userChats/coach/footer-athlete/messages':{one:{senderId:'coach',text:'ข้อความภาษาไทยยาวสำหรับทดสอบพื้นที่แชท '.repeat(30),createdAt:1}}};
    loginView.classList.add('hidden');portal.classList.remove('hidden');logoutBtn.classList.remove('hidden');renderNav();c91InstallHelp();
    // Include the real signed-in header's widest control in this isolated layout fixture.
    logoutBtn.parentElement.insertAdjacentHTML('afterbegin','<button id="cdNativePushButton" class="pill">🔔 เปิดแจ้งเตือนแอป</button>');
    showAthleteMenu('home');
  });
  await expect(page.locator('#c63VenueBottom')).toBeAttached();
  await expect(page.locator('#c95AdInquiry')).toBeVisible();
}
async function chatFits(page,width){
  await expect(page.locator('#s41LineInput')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{
    const shell=document.querySelector('.s41LineShell').getBoundingClientRect(),footer=document.getElementById('c95AdInquiry').getBoundingClientRect(),nav=document.getElementById('mobileNav').getBoundingClientRect();
    return shell.bottom<=footer.top&&footer.bottom<=nav.top&&nav.top-footer.bottom<12;
  })).toBe(true);
  const m=await page.evaluate(()=>{
    const rect=s=>document.querySelector(s).getBoundingClientRect();
    return {chat:rect('.s41LineShell').top,tabs:rect('#athletePage>.athleteTabs').height?rect('#athletePage>.athleteTabs').bottom:rect('.topbar').bottom,footer:rect('#c95AdInquiry').height,font:getComputedStyle(document.querySelector('#c95AdInquiry button')).fontSize,
      left:rect('.s41LineInbox').right,right:rect('.s41LineThread').left,scroll:document.documentElement.scrollWidth,contact:rect('#c95AdInquiry button').height};
  });
  expect(m.chat-m.tabs).toBeLessThan(64);expect(m.footer).toBeLessThanOrEqual(66);expect(m.font).toBe('12px');expect(m.contact).toBeGreaterThanOrEqual(44);
  expect(m.right).toBeGreaterThanOrEqual(m.left-2);expect(m.scroll).toBeLessThanOrEqual(width);
  await expect(page.locator('#s41LineInput')).toBeInViewport();
  await expect(page.locator('#c95AdInquiry')).toHaveCount(1);
  expect(await page.evaluate(()=>testWrites)).toEqual([]);
}
for(const width of [320,360,390,412,656])test(`native chat fills the screen after home and bookings at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});const {pageErrors}=await openIsolatedApp(page,true);await athleteHome(page);
  await page.evaluate(()=>showAthleteMenu('mybookings'));
  await expect(page.locator('#s40AthleteDynamic')).toContainText('การจองของฉัน');
  expect(await page.evaluate(()=>{const f=document.getElementById('c95AdInquiry'),d=document.getElementById('s40AthleteDynamic');return athletePage.lastElementChild===f&&f.getBoundingClientRect().top>=d.getBoundingClientRect().bottom;})).toBe(true);
  await page.evaluate(()=>showAthleteMenu('chat'));await chatFits(page,width);
  await expect(page.locator('#s41LineMessages')).toContainText('ข้อความภาษาไทยยาว');expect(pageErrors).toEqual([]);
});
test('athlete chat keeps the draft and footer visible on fold resize and short keyboard viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await openIsolatedApp(page,true);await athleteHome(page);await page.evaluate(()=>showAthleteMenu('chat'));
  await page.locator('#s41LineInput').fill('ข้อความที่ยังไม่ได้ส่ง');
  for(const size of [{width:656,height:728},{width:390,height:480},{width:390,height:844}]){
    await page.setViewportSize(size);await chatFits(page,size.width);await expect(page.locator('#s41LineInput')).toHaveValue('ข้อความที่ยังไม่ได้ส่ง');
  }
});
test('web chat and repeated athlete routes keep a single small footer after content',async({page})=>{
  await page.setViewportSize({width:390,height:844});const {pageErrors}=await openIsolatedApp(page);await athleteHome(page);
  for(const route of ['chat','home','mybookings','groupclasses','chat']){
    await page.evaluate(route=>showAthleteMenu(route),route);
    await expect(page.locator('#c95AdInquiry')).toHaveCount(1);await expect(page.locator('#c95AdInquiry')).toBeVisible();
    expect(await page.evaluate(()=>athletePage.lastElementChild.id)).toBe('c95AdInquiry');
  }
  await expect(page.locator('#c95AdInquiry a')).toHaveAttribute('href',/^mailto:hkthasawan1988@gmail\.com\?subject=/);
  await page.evaluate(()=>{window.staffContactOpened=false;c95OpenStaffChat=()=>{window.staffContactOpened=true;};});
  await page.getByRole('button',{name:'แชทกับทีมงาน',exact:true}).click();expect(await page.evaluate(()=>staffContactOpened)).toBe(true);
  expect(await page.evaluate(()=>testWrites)).toEqual([]);expect(pageErrors).toEqual([]);
});
