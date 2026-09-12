import Capacitor

final class CoachDiBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CoachDiNotificationsPlugin())
    }
}

