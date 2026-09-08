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

    @Test public void packagedLoginLoadsWithoutRequestingNotificationPermission() throws Exception {
        awaitTrue("!document.getElementById('loginView').classList.contains('hidden') && !!document.getElementById('loginBtn')");
        assertEquals("true", js("auth.currentUser===null"));
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS);
        assertEquals(36, info.applicationInfo.targetSdkVersion);
        assertTrue(Arrays.asList(info.requestedPermissions).contains("android.permission.POST_NOTIFICATIONS"));
        assertEquals(PackageManager.PERMISSION_DENIED, context.checkSelfPermission("android.permission.POST_NOTIFICATIONS"));
        awaitTrue("Capacitor.isPluginAvailable('PushNotifications') && Capacitor.isPluginAvailable('CoachDiNotifications')");
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
