const { test, expect } = require('@playwright/test');
const { openIsolatedApp } = require('./helpers/app');

async function athleteHome(page) {
  await page.evaluate(() => {
    localStorage.setItem('coachDiLocationConsent', 'yes');
    state.role = 'athlete'; state.user = { uid: 'fold-athlete' }; testAuth.currentUser = state.user;
    state.userDisplayName = 'นักกีฬาชื่อภาษาไทยยาวสำหรับทดสอบจอกาง';
    state.userProfile = { displayName: state.userDisplayName };
    state.allAthleteBookings = [{ id:'fold-booking', athleteId:'fold-athlete', coachId:'fold-coach',
      coachName:'โค้ชทดสอบ', date:TODAY, start:11, end:12, status:'confirmed',
      venue:'สนามที่มีชื่อภาษาไทยยาวเพื่อทดสอบการตัดบรรทัดบนโทรศัพท์' }];
    state.coaches = [{uid:'fold-coach', displayName:'โค้ชทดสอบ'}];
    loginView.classList.add('hidden'); portal.classList.remove('hidden'); logoutBtn.classList.remove('hidden');
    renderNav(); showAthleteMenu('home'); c91InstallHelp(); c92SyncMobileNav(); cd395SupportButton();
    state.c94GroupRows = [{id:'fold-group', status:'open', date:TODAY, createdAt:Date.now()+60000}];
    state.c94Counts = {group:1, coach:0}; c94Paint();
    window.scrollTo(0, 0);
  });
  await expect(page.locator('#c47Home .c47Hero')).toBeVisible();
  await expect(page.locator('#mobileNav .c92More')).toBeVisible();
}

async function setInsets(page, {top=28, right=0, bottom=56, left=0} = {}) {
  await page.evaluate(insets => {
    for (const [side, value] of Object.entries(insets)) document.documentElement.style.setProperty(`--safe-area-inset-${side}`, `${value}px`);
  }, {top,right,bottom,left});
}

async function assertBounds(page, insets) {
  await expect.poll(() => page.evaluate(() => {
    const header = document.querySelector('.topbar').getBoundingClientRect();
    const title = document.querySelector('#c47Home .c47Hero h1').getBoundingClientRect();
    return title.top - header.bottom;
  })).toBeGreaterThanOrEqual(0);
  await expect.poll(() => page.locator('#mobileNav').evaluate(el => {
    const nav=el.getBoundingClientRect(), support=document.querySelector('.cdSupportFloat').getBoundingClientRect();
    return nav.top - support.bottom;
  })).toBeGreaterThanOrEqual(10);
  const metrics = await page.evaluate(() => {
    const rect = el => {const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
    const visible = el => el.getClientRects().length > 0;
    return {
      width:innerWidth, height:innerHeight, scroll:document.documentElement.scrollWidth,
      header:rect(document.querySelector('.topbar')),
      headerButtons:[...document.querySelectorAll('.topbar button')].filter(visible).map(el=>({...rect(el),color:getComputedStyle(el).color})),
      nav:rect(document.getElementById('mobileNav')),
      navButtons:[...document.querySelectorAll('#mobileNav > button')].filter(visible).map(rect),
      glow:getComputedStyle(document.querySelector('#mobileNav .c92More')).animationName
    };
  });
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.width);
  expect(metrics.header.top).toBeGreaterThanOrEqual(insets.top);
  expect(metrics.navButtons).toHaveLength(5);
  for (const button of metrics.headerButtons) {
    expect(button.color).toBe('rgb(18, 48, 74)');
    expect(button.top).toBeGreaterThanOrEqual(metrics.header.top);
    expect(button.bottom).toBeLessThanOrEqual(metrics.header.bottom + 1);
    expect(button.left).toBeGreaterThanOrEqual(insets.left);
    expect(button.right).toBeLessThanOrEqual(metrics.width - insets.right);
  }
  for (const button of metrics.navButtons) {
    expect(button.top).toBeGreaterThanOrEqual(metrics.nav.top);
    expect(button.bottom).toBeLessThanOrEqual(metrics.height - insets.bottom);
    expect(button.left).toBeGreaterThanOrEqual(insets.left);
    expect(button.right).toBeLessThanOrEqual(metrics.width - insets.right);
  }
  expect(metrics.glow).toBe('cdNavNotice');
}

for (const [width,height] of [[320,740],[360,800],[390,844],[412,915],[656,728],[768,852],[840,932],[1024,900]]) {
  test(`athlete dashboard clears header, Fold taskbar and navigation at ${width}px`, async ({page}, testInfo) => {
    await page.setViewportSize({width,height});
    const {pageErrors}=await openIsolatedApp(page,true);
    const insets={top:28,right:0,bottom:56,left:0};
    await setInsets(page,insets); await athleteHome(page); await assertBounds(page,insets);
    const details=await page.locator('#c47Home .c47Next button').boundingBox();
    const support=await page.locator('.cdSupportFloat').boundingBox();
    const overlap=Math.max(0,Math.min(details.x+details.width,support.x+support.width)-Math.max(details.x,support.x)) * Math.max(0,Math.min(details.y+details.height,support.y+support.height)-Math.max(details.y,support.y));
    expect(overlap).toBe(0);
    await expect(page.locator('.cdSupportFloat')).toHaveAccessibleName(/แชทกับเจ้าหน้าที่/);
    await page.screenshot({path:testInfo.outputPath(`fold-home-${width}.png`)});
    // The final real control must remain reachable above the fixed app controls.
    const last=page.locator('#athletePage button:visible').last();
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await expect(last).toBeInViewport();
    const bottom=await last.evaluate(el=>el.getBoundingClientRect().bottom);
    const obstruction=await page.locator('.cdSupportFloat').evaluate(el=>el.getBoundingClientRect().top);
    expect(bottom).toBeLessThanOrEqual(obstruction);
    const stickyTop=await page.locator('.topbar').evaluate(el=>el.getBoundingClientRect().top);
    expect(stickyTop).toBeGreaterThanOrEqual(insets.top);
    await page.locator('#mobileNav .c92More').click();
    await expect(page.getByRole('heading',{name:'เมนูทั้งหมด',exact:true})).toBeVisible();
    const menu=await page.locator('.c92MenuPanel').boundingBox();
    expect(menu.y).toBeGreaterThanOrEqual(insets.top);
    expect(menu.y+menu.height).toBeLessThanOrEqual(height-insets.bottom);
    expect(pageErrors).toEqual([]); expect(await page.evaluate(()=>testWrites.length)).toBe(0);
  });
}

test('folding, taskbar changes and large text recalculate app clearance without reloading',async({page})=>{
  await page.setViewportSize({width:656,height:728}); await openIsolatedApp(page,true); await athleteHome(page);
  for (const scenario of [
    {width:656,height:728,top:28,right:0,bottom:24,left:0},
    {width:840,height:932,top:32,right:18,bottom:72,left:18},
    {width:390,height:844,top:28,right:0,bottom:24,left:0}
  ]) {
    await page.setViewportSize({width:scenario.width,height:scenario.height}); await setInsets(page,scenario);
    await page.evaluate(()=>{document.body.style.fontSize='20px';document.querySelector('#c47Home .c47Hero h1').style.fontSize='36px';window.scrollTo(0,0);});
    await assertBounds(page,scenario);
  }
  expect(await page.evaluate(()=>testWrites.length)).toBe(0);
});

test('taskbar padding alone moves floating controls without a viewport resize',async({page})=>{
  await page.setViewportSize({width:656,height:728}); await openIsolatedApp(page,true);
  await setInsets(page,{top:28,bottom:24}); await athleteHome(page);
  await assertBounds(page,{top:28,right:0,bottom:24,left:0});
  // Native CSS or an env() change can affect padding while the nav content box stays 60px.
  await page.evaluate(()=>document.documentElement.style.setProperty('--cd-safe-bottom','72px'));
  await assertBounds(page,{top:28,right:0,bottom:72,left:0});
  expect(await page.evaluate(()=>testWrites.length)).toBe(0);
});
