package com.coachdi.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
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
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs the packaged app in Android WebView. No account login or backend writes. */
@RunWith(AndroidJUnit4.class)
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

    @Test public void packagedLoginLoadsWithoutNotificationPermission() throws Exception {
        awaitTrue("!document.getElementById('loginView').classList.contains('hidden') && !!document.getElementById('loginBtn')");
        assertEquals("true", js("auth.currentUser===null"));
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS);
        assertEquals(36, info.applicationInfo.targetSdkVersion);
        assertFalse(Arrays.asList(info.requestedPermissions).contains("android.permission.POST_NOTIFICATIONS"));
        awaitTrue("!document.getElementById('c105PushButton') || getComputedStyle(document.getElementById('c105PushButton')).display==='none'");
        screenshot("login-portrait");
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

    private void assertFooterVisible() throws Exception {
        awaitTrue("(function(){var b=Array.from(document.querySelectorAll('#sheetContent button')).find(b=>b.textContent.trim()==='รับทราบ');if(!b)return false;var r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.left>=0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth;})()");
    }
}
