package com.coachdi.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import androidx.lifecycle.Lifecycle;
import androidx.test.espresso.Espresso;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.Arrays;
import org.junit.Before;
import org.junit.FixMethodOrder;
import org.junit.runners.MethodSorters;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs the packaged app in Android WebView. No account login or backend writes. */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class NativeUiTest {
    @Rule public ActivityScenarioRule<MainActivity> activity = new ActivityScenarioRule<>(MainActivity.class);

    private String js(String expression) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        activity.getScenario().onActivity(a -> a.getBridge().getWebView().evaluateJavascript(
            "(function(){try{return (" + expression + ");}catch(e){return 'JS_ERROR:'+e.message;}})()",
            value -> { result.set(value); done.countDown(); }
        ));
        assertTrue("WebView JavaScript callback timed out", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void awaitTrue(String expression) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 60000;
        String last = "";
        do {
            last = js(expression);
            if ("true".equals(last)) return;
            SystemClock.sleep(200);
        } while (SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError(expression + " returned " + last);
    }

    private void screenshot(String name) throws Exception {
        // JavaScript can finish before the WebView compositor presents the new frame.
        CountDownLatch frameReady = new CountDownLatch(1);
        activity.getScenario().onActivity(a -> {
            android.webkit.WebView view = a.getBridge().getWebView();
            view.postVisualStateCallback(SystemClock.uptimeMillis(), new android.webkit.WebView.VisualStateCallback() {
                @Override public void onComplete(long requestId) {
                    view.invalidate();
                    view.postOnAnimation(() -> view.postOnAnimation(frameReady::countDown));
                }
            });
        });
        assertTrue("WebView visual frame timed out", frameReady.await(10, TimeUnit.SECONDS));
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        SystemClock.sleep(300);
        // Shared test evidence survives Gradle uninstalling the app after the run.
        shell("mkdir -p /sdcard/Download/coach-di-uat");
        shell("screencap -p /sdcard/Download/coach-di-uat/" + name + ".png");
    }

    private void shell(String command) throws Exception {
        ParcelFileDescriptor pipe = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
        try (InputStream output = new ParcelFileDescriptor.AutoCloseInputStream(pipe)) {
            byte[] buffer = new byte[1024];
            while (output.read(buffer) != -1) { /* Wait for the shell command to complete. */ }
        }
    }

    @Before public void waitForBundledApp() throws Exception {
        activity.getScenario().onActivity(a -> a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
        awaitTrue("document.readyState==='complete' && typeof login==='function' && typeof cd392CourtWarning==='function'");
        awaitTrue("innerHeight>innerWidth && window.Capacitor.isNativePlatform() && document.documentElement.classList.contains('cd-native')");
    }

    @Test public void athleteChatUsesScreenAfterHomeWithContactFooter() throws Exception {
        assertEquals("true", js("(function(){window.chatAuthReady=false;auth.onAuthStateChanged(function(){window.chatAuthReady=true;});return true;})()"));
        awaitTrue("window.chatAuthReady && auth.currentUser===null");
        // Stub database reads before routing. Mutations fail immediately; this fixture
        // cannot submit a real message, booking, payment or notification registration.
        assertEquals("true", js("(function(){db.ref=function(path){const snapshot={val:()=>null,exists:()=>false};const ref={child:()=>ref,once:async()=>snapshot,on:(event,cb)=>cb(snapshot),off:()=>{},orderByChild:()=>ref,equalTo:()=>ref,limitToLast:()=>ref};['set','update','remove','push','transaction'].forEach(key=>ref[key]=()=>{throw Error('Native layout fixture forbids writes');});return ref;};" +
            "state.role='athlete';state.user={uid:'native-chat-fixture'};state.coaches=[{uid:'coach',displayName:'โค้ชทดสอบ'}];state.allAthleteBookings=[{id:'fixture',coachId:'coach',athleteId:state.user.uid,coachName:'โค้ชทดสอบ',date:TODAY,start:10,end:11,venue:'สนามทดสอบ',status:'confirmed'}];" +
            "localStorage.setItem('coachDiLocationConsent','denied');loginView.classList.add('hidden');portal.classList.remove('hidden');logoutBtn.classList.remove('hidden');renderNav();c91InstallHelp();" +
            "var pushButton=document.getElementById('cdNativePushButton');if(pushButton)pushButton.hidden=false;showAthleteMenu('home');return true;})()"));
        awaitTrue("!!document.getElementById('c63VenueBottom') && !!document.getElementById('c95AdInquiry')");
        assertEquals("true", js("(function(){showAthleteMenu('mybookings');return true;})()"));
        awaitTrue("athletePage.lastElementChild.id==='c95AdInquiry' && document.getElementById('s40AthleteDynamic').dataset.page==='mybookings'");
        assertEquals("true", js("(function(){showAthleteMenu('chat');return true;})()"));
        awaitTrue("!!document.getElementById('s41LineInput')");
        assertEquals("true", js("(function(){document.getElementById('s41LineMessages').innerHTML='<div class=s41LineBubble>'+ 'ข้อความภาษาไทยทดสอบแชท '.repeat(60)+'</div>';return true;})()"));
        awaitTrue("(function(){var shell=document.querySelector('.s41LineShell').getBoundingClientRect(),footer=document.getElementById('c95AdInquiry').getBoundingClientRect(),nav=document.getElementById('mobileNav').getBoundingClientRect(),input=document.getElementById('s41LineInput').getBoundingClientRect();return shell.height>innerHeight*.35&&shell.bottom<=footer.top&&footer.bottom<=nav.top&&nav.top-footer.bottom<12&&input.top>=shell.top&&input.bottom<=shell.bottom&&document.documentElement.scrollWidth<=innerWidth;})()");
        assertEquals("true", js("auth.currentUser===null"));
        screenshot("athlete-chat-footer");
    }

    @Test public void courtWeekAndPlayerProfileFitAndroidWebView() throws Exception {
        assertEquals("true", js("(function(){window.courtAuthReady=false;auth.onAuthStateChanged(function(){window.courtAuthReady=true;});return true;})()"));
        awaitTrue("window.courtAuthReady && auth.currentUser===null");
        assertEquals("true", js("(function(){db.ref=function(){const snapshot={val:()=>null,exists:()=>false};const ref={child:()=>ref,once:async()=>snapshot,on:(event,cb)=>cb(snapshot),off:()=>{},orderByChild:()=>ref,equalTo:()=>ref,limitToLast:()=>ref};['set','update','remove','push','transaction'].forEach(key=>ref[key]=()=>{throw Error('Native court fixture forbids writes');});return ref;};" +
            "state.role='athlete';state.user={uid:'native-court-fixture'};state.userProfile={role:'athlete',displayName:'มะลิ นักกีฬาทดสอบ'};state.coaches=[{uid:'fixture-coach',displayName:'โค้ชทดสอบ'}];state.availability={start:8,end:20};state.weekStart=TODAY;state.venues=[{id:'court',name:'สนามเทนนิสทดสอบ',openStart:8,openEnd:22}];state.coachLocations=[{date:TODAY,start:9,end:11,venueId:'court'}];state.cdPublicBookings=[{date:TODAY,start:12,end:13,venueName:'VISDA Premium Tennis Club',active:true}];" +
            "localStorage.setItem('coachDiLocationConsent','denied');loginView.classList.add('hidden');portal.classList.remove('hidden');logoutBtn.classList.remove('hidden');renderNav();c91InstallHelp();showAthleteMenu('home');cd392ApplyFlow('profile');state.coachId='fixture-coach';" +
            "for(const child of athletePage.children)child.style.display='none';document.querySelector('#athletePage>.athleteTabs').style.display='flex';document.getElementById('coachBookingTab').style.display='block';document.querySelector('#athletePage .scheduleShell').style.display='block';renderSchedule();c95InstallAdInquiry();window.scrollTo(0,0);return true;})()"));
        awaitTrue("(function(){var table=document.getElementById('scheduleTable'),box=table.getBoundingClientRect();return table.querySelectorAll('.dayHead').length===7&&box.width>0&&box.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth&&document.getElementById('cdWeekVenues').textContent.includes('VISDA Premium Tennis Club');})()");
        screenshot("court-seven-days");
        assertEquals("true", js("(function(){showAthleteMenu('profile');window.scrollTo(0,0);return true;})()"));
        awaitTrue("(function(){var photo=document.querySelector('.cdPlayerAvatar'),box=photo.getBoundingClientRect();return document.querySelector('.cdPlayerHero h1').textContent==='มะลิ นักกีฬาทดสอบ'&&box.width===box.height&&getComputedStyle(photo).borderRadius==='50%'&&document.documentElement.scrollWidth<=innerWidth;})()");
        screenshot("court-player-profile");
        assertEquals("true", js("auth.currentUser===null"));
    }

    @Test public void packagedLoginLoadsWithoutRequestingNotificationPermission() throws Exception {
        awaitTrue("!document.getElementById('loginView').classList.contains('hidden') && !!document.getElementById('loginBtn')");
        assertEquals("true", js("auth.currentUser===null"));
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS);
        assertEquals(36, info.applicationInfo.targetSdkVersion);
        assertTrue(Arrays.asList(info.requestedPermissions).contains("android.permission.POST_NOTIFICATIONS"));
        assertEquals(PackageManager.PERMISSION_DENIED, context.checkSelfPermission("android.permission.POST_NOTIFICATIONS"));
        awaitTrue("Capacitor.isPluginAvailable('PushNotifications') && Capacitor.isPluginAvailable('CoachDiNotifications') && Capacitor.isPluginAvailable('FirebaseAppCheck')");
        awaitTrue("!document.getElementById('c105PushButton') || getComputedStyle(document.getElementById('c105PushButton')).display==='none'");
        screenshot("login-portrait");
    }

    @Test public void foldSizedWebViewKeepsHeaderAndNavigationInsideSystemInsets() throws Exception {
        try {
            shell("wm size 1968x2184");
            shell("wm density 480");
            awaitTrue("innerWidth>=650 && innerWidth<=660");
            // Wait for the initial signed-out callback before showing a UI-only fixture.
            assertEquals("true", js("(function(){window.foldAuthReady=false;auth.onAuthStateChanged(function(){window.foldAuthReady=true;});return true;})()"));
            awaitTrue("window.foldAuthReady && auth.currentUser===null");
            // Presentation fixture only: no Firebase account, network writes or bookings.
            assertEquals("true", js("(function(){state.role='athlete';state.user={uid:'native-layout-fixture'};" +
                "loginView.classList.add('hidden');portal.classList.remove('hidden');renderNav();c92SyncMobileNav();" +
                "athletePage.classList.add('hidden');coachPage.classList.add('hidden');" +
                "document.querySelector('.main').insertAdjacentHTML('afterbegin','<section id=foldShellFixture><div class=c47Hero><div><h1>สวัสดีค่ะ/ครับ นักกีฬาทดสอบจอกาง</h1><p>ข้อความภาษาไทยสำหรับทดสอบขอบบนและแถบระบบ</p></div><div class=c47Next><b>คลาสถัดไป</b><p>สนามทดสอบชื่อภาษาไทยยาว</p><button class=c47Btn>ดูรายละเอียด</button></div></div><div style=height:900px></div><button id=foldLastButton class=pill>ปุ่มท้ายหน้า</button></section>');" +
                "cd395SupportButton();window.scrollTo(0,0);return true;})()"));
            awaitTrue("(function(){var h=document.querySelector('.topbar').getBoundingClientRect(),t=document.querySelector('#foldShellFixture h1').getBoundingClientRect();return t.top>=h.bottom;})()");
            assertNativeChrome("parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom'))||0");
            for (int bottom : new int[]{24, 64}) {
                // SystemBars owns --safe-area-inset-* and rewrites it during resize.
                // Simulate an effective taskbar inset without racing that native callback.
                assertEquals("true", js("(function(){document.documentElement.style.setProperty('--cd-safe-bottom','" + bottom + "px');return true;})()"));
                assertNativeChrome(String.valueOf(bottom));
            }
            screenshot("fold-home-taskbar");
            assertEquals("true", js("(function(){window.scrollTo(0,document.documentElement.scrollHeight);return true;})()"));
            awaitTrue("document.getElementById('foldLastButton').getBoundingClientRect().bottom<=document.querySelector('.cdSupportFloat').getBoundingClientRect().top");
            assertEquals("true", js("auth.currentUser===null"));
        } finally {
            shell("wm size reset"); shell("wm density reset");
        }
    }

    private void assertNativeChrome(String safeExpression) throws Exception {
        try {
            awaitTrue("(function(){var nav=document.getElementById('mobileNav').getBoundingClientRect(),support=document.querySelector('.cdSupportFloat').getBoundingClientRect(),safe=" + safeExpression + ";var buttons=Array.from(document.querySelectorAll('#mobileNav>button')).filter(b=>b.getClientRects().length);return buttons.length===5&&buttons.every(b=>{var r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight-safe;})&&support.bottom<=nav.top-10&&document.documentElement.scrollWidth<=innerWidth;})()");
        } catch (AssertionError failure) {
            String metrics = js("(function(){var root=document.documentElement;return {width:innerWidth,height:innerHeight,scrollWidth:root.scrollWidth,safe:getComputedStyle(root).getPropertyValue('--safe-area-inset-bottom'),effective:getComputedStyle(root).getPropertyValue('--cd-safe-bottom'),nav:document.getElementById('mobileNav').getBoundingClientRect().toJSON(),support:document.querySelector('.cdSupportFloat')?.getBoundingClientRect().toJSON(),buttons:Array.from(document.querySelectorAll('#mobileNav>button')).filter(b=>b.getClientRects().length).map(b=>b.getBoundingClientRect().toJSON())};})()");
            screenshot("fold-layout-failure");
            throw new AssertionError(failure.getMessage() + " Layout metrics: " + metrics, failure);
        }
    }

    @Test public void guidedAthleteNavigationFitsRotationAndAndroidBack() throws Exception {
        assertEquals("true", js("(function(){window.tourAuthReady=false;auth.onAuthStateChanged(function(){window.tourAuthReady=true;});return true;})()"));
        awaitTrue("window.tourAuthReady && auth.currentUser===null");
        assertEquals("true", js("(function(){db.ref=function(){const snapshot={val:()=>null,exists:()=>false};const ref={child:()=>ref,once:async()=>snapshot,on:(event,cb)=>cb(snapshot),off:()=>{},orderByChild:()=>ref,equalTo:()=>ref,limitToLast:()=>ref};['set','update','remove','push','transaction'].forEach(key=>ref[key]=()=>{throw Error('Native tour fixture forbids writes');});return ref;};" +
            "state.role='athlete';state.user={uid:'native-tour-fixture'};state.userProfile={role:'athlete',displayName:'มะลิ นักกีฬาทดสอบ'};localStorage.setItem('coachDiLocationConsent','denied');loginView.classList.add('hidden');portal.classList.remove('hidden');logoutBtn.classList.remove('hidden');renderNav();c91InstallHelp();showAthleteMenu('home');c91ShowGuide(true);return true;})()"));
        awaitTrue("!!document.querySelector('#c91Guide .cdTourPanel') && portal.inert");
        assertTourFits();screenshot("athlete-guide-portrait");
        assertEquals("true", js("(function(){document.querySelector('[data-tour=next]').click();return true;})()"));
        awaitTrue("document.getElementById('cdTourTitle').textContent==='การจองของฉัน' && document.getElementById('s40AthleteDynamic').dataset.page==='mybookings'");
        activity.getScenario().onActivity(a -> a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
        awaitTrue("innerWidth>innerHeight");assertTourFits();screenshot("athlete-guide-landscape");
        Espresso.pressBackUnconditionally();awaitTrue("!document.getElementById('c91Guide') && !portal.inert");
        assertEquals(Lifecycle.State.RESUMED, activity.getScenario().getState());
        assertEquals("true", js("(function(){document.querySelector('#mobileNav .c92More').click();return true;})()"));
        awaitTrue("!!document.getElementById('athletePhotoFile') && !!document.getElementById('cdRefundSettings') && document.querySelector('#mobileNav .c92More').textContent==='ตั้งค่า'");
        assertEquals("true", js("auth.currentUser===null"));
    }

    @Test public void knockerProfileLinkAndNotificationOwnershipSurviveRotation() throws Exception {
        assertEquals("true", js("(function(){window.shareAuthReady=false;auth.onAuthStateChanged(()=>window.shareAuthReady=true);return true;})()"));
        awaitTrue("window.shareAuthReady && auth.currentUser===null");
        assertEquals("true",js("(function(){db.ref=function(path){var value=String(path)==='coachProfiles/native-knocker'?{displayName:'Knocker Fixture',providerKind:'knocker',status:'active'}:null;var s={val:()=>value,exists:()=>value!==null};var r={once:async()=>s,on:(e,c)=>c(s),off:()=>{},child:()=>r,orderByChild:()=>r,equalTo:()=>r,limitToLast:()=>r};['set','update','remove','push','transaction'].forEach(k=>r[k]=()=>{throw Error('Read-only native fixture');});return r;};state.role='coach';state.user={uid:'native-knocker'};state.coachProfile={displayName:'Knocker Fixture',providerKind:'knocker',status:'active'};loginView.classList.add('hidden');portal.classList.remove('hidden');showCoach('overview');return true;})()"));
        awaitTrue("!!document.querySelector('#cdProviderShare [data-provider-copy]') && document.querySelector('#cdProviderShare input').value==='https://coach-di.netlify.app/?portal=athlete&knocker=native-knocker' && document.documentElement.scrollWidth<=innerWidth");
        screenshot("knocker-share-portrait");
        activity.getScenario().onActivity(a -> a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
        awaitTrue("innerWidth>innerHeight && document.documentElement.scrollWidth<=innerWidth");
        screenshot("knocker-share-landscape");
        assertEquals("true",js("(function(){var old={id:'old-athlete',athleteId:'native-knocker',coachId:'other',coach:'PRIVATE ATHLETE',date:TODAY,start:8,status:'confirmed'},own={id:'own-provider',coachId:'native-knocker',athleteId:'customer',athlete:'Correct customer',date:TODAY,start:10,status:'confirmed'};state.allAthleteBookings=[old];state.bookings=[old,own];state.s42CoachBookings=[];c95OpenNotifications();return document.querySelectorAll('#coachContent .c88StatusRow').length===1&&coachContent.textContent.includes('Correct customer')&&!coachContent.textContent.includes('PRIVATE ATHLETE')&&auth.currentUser===null;})()"));
    }

    @Test public void coachHolidayCalendarFitsRotationAndKeepsSavedDaysVisible() throws Exception {
        assertEquals("true", js("(function(){window.offAuthReady=false;auth.onAuthStateChanged(function(){window.offAuthReady=true;});return true;})()"));
        awaitTrue("window.offAuthReady && auth.currentUser===null");
        assertEquals("true", js("(function(){db.ref=function(path){const value=String(path).startsWith('coachTimeOff/')?{holiday:{coachId:'native-off-coach',startDate:TODAY,endDate:isoAdd(TODAY,2),fullDay:true}}:null;const snapshot={val:()=>value,exists:()=>value!==null};const ref={child:()=>ref,once:async()=>snapshot,on:(event,cb)=>cb(snapshot),off:()=>{},orderByChild:()=>ref,equalTo:()=>ref,limitToLast:()=>ref};['set','update','remove','push','transaction'].forEach(key=>ref[key]=()=>{throw Error('Native holiday fixture forbids writes');});return ref;};state.role='coach';state.user={uid:'native-off-coach'};state.coachProfile={displayName:'โค้ชทดสอบ'};state.bookings=[];state.s42CoachBookings=[];state.c71CoachAppointments=[];state.c76GroupClasses=[];state.s42Date=TODAY;state.s42View='timeoff';loginView.classList.add('hidden');portal.classList.remove('hidden');renderNav();showCoach('schedule');return true;})()"));
        awaitTrue("!!document.getElementById('cdOffForm') && !!document.querySelector('[data-off-remove]') && document.documentElement.scrollWidth<=innerWidth");
        assertEquals("true",js("CoachDiTimeOff.matches(TODAY,9,10)"));
        screenshot("coach-holidays-portrait");
        activity.getScenario().onActivity(a -> a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
        awaitTrue("innerWidth>innerHeight && document.documentElement.scrollWidth<=innerWidth && !!document.getElementById('cdOffSave')");
        screenshot("coach-holidays-landscape");
        assertEquals("true",js("(function(){state.s42View='today';showCoach('schedule');return !!document.querySelector('.cdOffGridEvent')&&!document.querySelector('.cdGridCell[data-free=true]');})()"));
        assertEquals("true",js("CoachDiCourtCore.venueLabel('VISDA Premium Tennis Club')==='Visda' && CoachDiCourtCore.venueLabel('Tropp Tennis Club')==='Tro' && auth.currentUser===null"));
    }

    private void assertTourFits() throws Exception {
        awaitTrue("(function(){var panel=document.querySelector('.cdTourPanel').getBoundingClientRect(),buttons=Array.from(document.querySelectorAll('.cdTourPanel button'));return panel.left>=0&&panel.right<=innerWidth&&panel.top>=0&&panel.bottom<=innerHeight&&buttons.every(b=>{var r=b.getBoundingClientRect();return r.top>=panel.top&&r.bottom<=panel.bottom&&r.height>=44;})&&document.documentElement.scrollWidth<=innerWidth;})()");
    }

    @Test public void groupClassAnnouncementSurvivesRotationAndBackMarksItRead() throws Exception {
        assertEquals("true", js("(function(){window.classAuthReady=false;auth.onAuthStateChanged(function(){window.classAuthReady=true;});return true;})()"));
        awaitTrue("window.classAuthReady && auth.currentUser===null");
        // Read-only presentation fixture: no Firebase login, class creation or booking.
        assertEquals("true", js("(function(){state.role='athlete';state.user={uid:'native-class-fixture'};" +
            "localStorage.removeItem('coachdi-class-announcements:v1:native-class-fixture');" +
            "loginView.classList.add('hidden');portal.classList.remove('hidden');renderNav();" +
            "state.c94GroupRows=Array.from({length:8},(_,i)=>({id:'native-class-'+i,coachId:'fixture-coach',coachName:'โค้ชทดสอบ',title:'คลาสกลุ่มใหม่สำหรับทดสอบภาษาไทยยาว'.repeat(4),date:new Date(Date.now()+432000000).toISOString().slice(0,10),start:'10:00',end:'11:00',status:'open',capacity:8,approvedCount:1,venueName:'สนามทดสอบภาษาไทยยาว'.repeat(4),priceSatang:20000,createdAt:Date.now()}));" +
            "c94Refresh();return true;})()"));
        awaitTrue("!!document.getElementById('cdClassLaunch')");
        assertClassFooterVisible();screenshot("group-class-portrait");
        activity.getScenario().onActivity(a -> a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
        awaitTrue("innerWidth>innerHeight");assertClassFooterVisible();screenshot("group-class-landscape");
        Espresso.pressBackUnconditionally();
        awaitTrue("!document.getElementById('cdClassLaunch')");
        assertEquals("true", js("(function(){c94Refresh();return !document.getElementById('cdClassLaunch')&&state.c94Counts.group===0&&auth.currentUser===null;})()"));
        assertEquals(Lifecycle.State.RESUMED, activity.getScenario().getState());
    }

    private void assertClassFooterVisible() throws Exception {
        awaitTrue("(function(){var box=document.querySelector('#cdClassLaunch section').getBoundingClientRect(),footer=document.querySelector('#cdClassLaunch footer').getBoundingClientRect(),body=document.querySelector('.cdClassLaunchBody'),safe=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom'))||0;return box.left>=0&&box.right<=innerWidth&&footer.bottom<=innerHeight-safe&&footer.top>=0&&body.scrollHeight>body.clientHeight&&document.documentElement.scrollWidth<=innerWidth;})()");
    }

    @Test public void thaiWarningSurvivesRotationAndAndroidBack() throws Exception {
        // UI-only fixture: this warning and venue chooser do not create a booking.
        assertEquals("true", js("(function(){state.coachId='native-ui-fixture';state.coaches=[{uid:'native-ui-fixture',displayName:'รายละเอียดภาษาไทยยาวสำหรับตรวจหน้าจอ'.repeat(40)}];cd392CourtWarning('2026-10-10',10);return true;})()"));
        awaitTrue("!!document.querySelector('#sheetContent > .cdSheetBody') && !document.getElementById('sheetWrap').classList.contains('hidden')");
        assertFooterVisible();
        assertEquals("true", js("(function(){var body=document.querySelector('.cdSheetBody');body.scrollTop=body.scrollHeight;return body.scrollHeight>body.clientHeight;})()"));
        assertFooterVisible();
        screenshot("warning-portrait");
        activity.getScenario().onActivity(a -> a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
        awaitTrue("innerWidth>innerHeight");
        assertFooterVisible();
        screenshot("warning-landscape");
        assertEquals("true", js("(function(){Array.from(document.querySelectorAll('#sheetContent button')).find(b=>b.textContent.trim()==='รับทราบ').click();return true;})()"));
        awaitTrue("document.querySelectorAll('#bookingVenueSelect').length===1");
        Espresso.pressBackUnconditionally();
        awaitTrue("document.getElementById('sheetWrap').classList.contains('hidden')");
        assertEquals(Lifecycle.State.RESUMED, activity.getScenario().getState());
        assertEquals("true", js("auth.currentUser===null"));
        screenshot("back-dismissed-sheet");
    }

    @Test public void optionalRefundAccountRegistrationStaysInsideWebView() throws Exception {
        assertEquals("true", js("(function(){registerAthlete();return true;})()"));
        awaitTrue("!!document.getElementById('cdrAccountNumber') && !!document.querySelector('#sheetContent > .cdSheetBody')");
        assertEquals("true", js("document.getElementById('cdrAccountNumber').inputMode==='numeric' && !document.getElementById('cdrAccountNumber').required"));
        assertEquals("true", js("(function(){document.getElementById('cdrAccountName').value='ชื่อภาษาไทยสำหรับทดสอบบัญชี'.repeat(5);return true;})()"));
        assertRegistrationFooterVisible();
        screenshot("refund-signup-portrait");
        activity.getScenario().onActivity(a -> a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
        awaitTrue("innerWidth>innerHeight");
        assertRegistrationFooterVisible();
        screenshot("refund-signup-landscape");
        Espresso.pressBackUnconditionally();
        awaitTrue("document.getElementById('sheetWrap').classList.contains('hidden')");
        assertEquals("true", js("auth.currentUser===null"));
    }

    private void assertRegistrationFooterVisible() throws Exception {
        awaitTrue("(function(){var b=document.querySelector('[data-cdr=register]');if(!b)return false;var r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.left>=0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth;})()");
    }

    private void assertFooterVisible() throws Exception {
        awaitTrue("(function(){var b=Array.from(document.querySelectorAll('#sheetContent button')).find(b=>b.textContent.trim()==='รับทราบ');if(!b)return false;var r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.left>=0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth;})()");
    }
    private void awaitNotificationCount(android.app.NotificationManager manager, int expected) {
        long deadline = SystemClock.elapsedRealtime() + 5000;
        while (manager.getActiveNotifications().length != expected && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
        assertEquals(expected, manager.getActiveNotifications().length);
    }
    @Test public void yNativeNotificationChannelUsesSystemSoundAndReportsSettings() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.app.NotificationManager manager = (android.app.NotificationManager) context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        shell("pm grant com.coachdi.app android.permission.POST_NOTIFICATIONS");
        js("(Capacitor.Plugins.CoachDiNotifications.prepareChannel().then(()=>Capacitor.Plugins.CoachDiNotifications.getStatus()).then(status=>window.__nativeNotificationStatus=status),true)");
        awaitTrue("window.__nativeNotificationStatus && window.__nativeNotificationStatus.appEnabled && window.__nativeNotificationStatus.channelEnabled");
        android.app.NotificationChannel channel = manager.getNotificationChannel(CoachDiMessagingService.CHANNEL);
        assertNotNull(channel);
        assertEquals(android.app.NotificationManager.IMPORTANCE_HIGH, channel.getImportance());
        assertEquals(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, channel.getSound());
    }
    @Test public void zDataPushDisplaysOnceAndSignedOutSessionSuppressesIt() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        shell("pm grant com.coachdi.app android.permission.POST_NOTIFICATIONS");
        android.content.SharedPreferences preferences = context.getSharedPreferences(CoachDiNotificationsPlugin.PREFS, android.content.Context.MODE_PRIVATE);
        android.app.NotificationManager manager = (android.app.NotificationManager) context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        class TestService extends CoachDiMessagingService { TestService() { attachBaseContext(context); } }
        TestService service = new TestService();
        com.google.firebase.messaging.RemoteMessage message = new com.google.firebase.messaging.RemoteMessage.Builder("41680156013")
            .setMessageId("fixture-message").addData("notificationId","fixture-notification").addData("type","chat_message")
            .addData("body","private fixture text").build();
        try {
            preferences.edit().putString("uid","fixture").putBoolean("enabled",true).commit();
            service.onMessageReceived(message); service.onMessageReceived(message);
            awaitNotificationCount(manager, 1);
            assertEquals("fixture-notification",manager.getActiveNotifications()[0].getTag());
            assertFalse(manager.getActiveNotifications()[0].getNotification().extras.getCharSequence(android.app.Notification.EXTRA_TEXT).toString().contains("private fixture text"));
            manager.cancelAll(); awaitNotificationCount(manager, 0);
            com.google.firebase.messaging.RemoteMessage wrongRecipient = new com.google.firebase.messaging.RemoteMessage.Builder("41680156013")
                .setMessageId("fixture-other").addData("notificationId","fixture-other-notification")
                .addData("userId","other-user").addData("body","other account text").build();
            service.onMessageReceived(wrongRecipient); assertEquals(0,manager.getActiveNotifications().length);
            com.google.firebase.messaging.RemoteMessage ownRecipient = new com.google.firebase.messaging.RemoteMessage.Builder("41680156013")
                .setMessageId("fixture-own").addData("notificationId","fixture-own-notification")
                .addData("userId","fixture").addData("body","own account text").build();
            service.onMessageReceived(ownRecipient); awaitNotificationCount(manager, 1);
            assertEquals("own account text",manager.getActiveNotifications()[0].getNotification().extras.getCharSequence(android.app.Notification.EXTRA_TEXT).toString());
            manager.cancelAll(); preferences.edit().putBoolean("enabled",false).commit();
            awaitNotificationCount(manager, 0);
            service.onMessageReceived(message); assertEquals(0,manager.getActiveNotifications().length);
        } finally {
            // Runs last; Gradle uninstalls this disposable emulator app after instrumentation.
            // Revoking a runtime permission here would kill the instrumentation process.
            manager.cancelAll(); preferences.edit().clear().commit();
        }
    }
}
