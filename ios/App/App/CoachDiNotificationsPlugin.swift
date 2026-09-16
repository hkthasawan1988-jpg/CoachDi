import Capacitor
import UIKit
import UserNotifications

@objc(CoachDiNotificationsPlugin)
final class CoachDiNotificationsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "CoachDiNotificationsPlugin"
    let jsName = "CoachDiNotifications"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configureSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareChannel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBuildInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unregister", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPending", returnType: CAPPluginReturnPromise)
    ]

    private let defaults = UserDefaults.standard
    private let uidKey = "coach_di_notifications.uid"
    private let deviceKey = "coach_di_notifications.device_id"
    private let enabledKey = "coach_di_notifications.enabled"

    @objc func configureSession(_ call: CAPPluginCall) {
        let uid = call.getString("uid") ?? ""
        let enabled = (call.getBool("enabled") ?? false) && !uid.isEmpty
        defaults.set(uid, forKey: uidKey)
        defaults.set(call.getString("deviceId") ?? "", forKey: deviceKey)
        defaults.set(enabled, forKey: enabledKey)
        if !enabled {
            UNUserNotificationCenter.current().removeAllDeliveredNotifications()
            DispatchQueue.main.async { UIApplication.shared.applicationIconBadgeNumber = 0 }
        }
        call.resolve()
    }

    @objc func getSession(_ call: CAPPluginCall) {
        call.resolve([
            "uid": defaults.string(forKey: uidKey) ?? "",
            "deviceId": defaults.string(forKey: deviceKey) ?? "",
            "enabled": defaults.bool(forKey: enabledKey)
        ])
    }

    @objc func prepareChannel(_ call: CAPPluginCall) {
        // iOS has no notification channels. Authorization is managed by the
        // PushNotifications plugin and system settings.
        call.resolve()
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let enabled: Bool
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: enabled = true
            default: enabled = false
            }
            call.resolve(["appEnabled": enabled, "channelEnabled": enabled])
        }
    }

    @objc func getBuildInfo(_ call: CAPPluginCall) {
        #if DEBUG
        call.resolve(["debug": true])
        #else
        call.resolve(["debug": false])
        #endif
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Unable to open notification settings")
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                opened ? call.resolve() : call.reject("Unable to open notification settings")
            }
        }
    }

    @objc func unregister(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.unregisterForRemoteNotifications()
            call.resolve()
        }
    }

    @objc func getPending(_ call: CAPPluginCall) {
        // Capacitor emits pushNotificationActionPerformed for cold and warm taps.
        call.resolve([:])
    }

    @objc func clearPending(_ call: CAPPluginCall) {
        call.resolve()
    }
}

