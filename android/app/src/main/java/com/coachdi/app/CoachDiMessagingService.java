package com.coachdi.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** The existing backend sends data messages; render them even with the WebView closed. */
public class CoachDiMessagingService extends MessagingService {
    public static final String CHANNEL = "coach_di_updates";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        SharedPreferences prefs = getSharedPreferences(CoachDiNotificationsPlugin.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) return;
        Map<String, String> data = message.getData();
        String recipient = data.get("userId");
        if (recipient != null && !recipient.equals(prefs.getString("uid", ""))) return;
        super.onMessageReceived(message);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "การจองและข้อความ Coach Di", NotificationManager.IMPORTANCE_HIGH);
            channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
        }
        String id = data.get("notificationId");
        if (id == null || id.isEmpty()) id = message.getMessageId();
        if (id == null || id.isEmpty()) return;
        Intent intent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("google.message_id", id);
        intent.putExtra("notificationId", data.get("notificationId"));
        intent.putExtra("type", data.get("type"));
        PendingIntent tap = PendingIntent.getActivity(this, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // Legacy payloads lack recipient identity. Keep their lock-screen text generic;
        // opening the notification validates ownership against the signed-in user's database path.
        String title = recipient == null ? "Coach Di" : data.getOrDefault("title", "Coach Di");
        String body = recipient == null ? "มีการแจ้งเตือนใหม่ แตะเพื่อเปิด Coach Di" : data.getOrDefault("body", "คุณมีการแจ้งเตือนใหม่");
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(tap)
            .setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPriority(NotificationCompat.PRIORITY_HIGH);
        // A stable tag replaces a repeated delivery instead of creating another notification.
        manager.notify(id, 0, notification.build());
    }
}
