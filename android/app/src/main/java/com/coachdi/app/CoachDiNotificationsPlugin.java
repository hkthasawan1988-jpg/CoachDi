package com.coachdi.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CoachDiNotifications")
public class CoachDiNotificationsPlugin extends Plugin {
    public static final String PREFS = "coach_di_notifications";

    @PluginMethod
    public void configureSession(PluginCall call) {
        String uid = call.getString("uid", "");
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false)) && !uid.isEmpty();
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("uid", uid).putBoolean("enabled", enabled).apply();
        if (!enabled) {
            NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            manager.cancelAll();
        }
        call.resolve();
    }

    @PluginMethod
    public void getSession(PluginCall call) {
        JSObject result = new JSObject();
        result.put("uid", getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("uid", ""));
        call.resolve(result);
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        Intent intent = getActivity().getIntent();
        JSObject result = new JSObject();
        if (intent != null) {
            result.put("notificationId", intent.getStringExtra("notificationId"));
            result.put("type", intent.getStringExtra("type"));
        }
        call.resolve(result);
    }

    @PluginMethod
    public void clearPending(PluginCall call) {
        Intent intent = getActivity().getIntent();
        if (intent != null) { intent.removeExtra("notificationId"); intent.removeExtra("type"); }
        call.resolve();
    }
}
