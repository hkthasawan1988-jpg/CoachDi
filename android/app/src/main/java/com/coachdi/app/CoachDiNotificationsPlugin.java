package com.coachdi.app;

import android.app.NotificationManager;
import android.app.NotificationChannel;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessaging;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CoachDiNotifications")
public class CoachDiNotificationsPlugin extends Plugin {
    public static final String PREFS = "coach_di_notifications";
    static final Object SESSION_LOCK = new Object();

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        // BridgeActivity forwards a warm-start intent without replacing getIntent().
        // Keep getPending/clearPending attached to the notification actually tapped.
        if (intent != null) getActivity().setIntent(intent);
    }

    @PluginMethod
    public void configureSession(PluginCall call) {
        String uid = call.getString("uid", "");
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false)) && !uid.isEmpty();
        synchronized (SESSION_LOCK) {
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("uid", uid).putString("deviceId", call.getString("deviceId", ""))
                .putBoolean("enabled", enabled).apply();
            if (!enabled) {
                NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
                manager.cancelAll();
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getSession(PluginCall call) {
        JSObject result = new JSObject();
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        result.put("uid", prefs.getString("uid", ""));
        result.put("deviceId", prefs.getString("deviceId", ""));
        result.put("enabled", prefs.getBoolean("enabled", false));
        call.resolve(result);
    }

    @PluginMethod
    public void prepareChannel(PluginCall call) {
        CoachDiMessagingService.ensureChannel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("appEnabled", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        boolean channelEnabled = true;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = manager.getNotificationChannel(CoachDiMessagingService.CHANNEL);
            channelEnabled = channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        result.put("channelEnabled", channelEnabled);
        call.resolve(result);
    }

    @PluginMethod
    public void getBuildInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("debug", BuildConfig.DEBUG);
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 26) {
            intent = new Intent(Boolean.TRUE.equals(call.getBoolean("channel", false))
                ? Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS : Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.putExtra(Settings.EXTRA_CHANNEL_ID, CoachDiMessagingService.CHANNEL);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName()));
        }
        getActivity().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void unregister(PluginCall call) {
        FirebaseMessaging messaging = FirebaseMessaging.getInstance();
        messaging.setAutoInitEnabled(false);
        // Capacitor's unregister resolves before deleteToken finishes. A subsequent
        // login must wait for deletion before requesting the replacement token.
        messaging.deleteToken().addOnCompleteListener(task -> {
            if (task.isSuccessful()) call.resolve();
            else call.reject("Unable to reset notification registration");
        });
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        Intent intent = getActivity().getIntent();
        JSObject result = new JSObject();
        if (intent != null) {
            result.put("notificationId", intent.getStringExtra("notificationId"));
            result.put("type", intent.getStringExtra("type"));
            result.put("userId", intent.getStringExtra("userId"));
        }
        call.resolve(result);
    }

    @PluginMethod
    public void clearPending(PluginCall call) {
        Intent intent = getActivity().getIntent();
        if (intent != null) {
            intent.removeExtra("notificationId"); intent.removeExtra("type");
            intent.removeExtra("userId"); intent.removeExtra("google.message_id");
        }
        call.resolve();
    }
}
