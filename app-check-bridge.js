(function (root) {
  'use strict';
  const cap = root.Capacitor;
  const native = !!cap?.isNativePlatform?.();
  const plugin = native ? (cap.Plugins?.FirebaseAppCheck || cap.registerPlugin?.('FirebaseAppCheck')) : null;
  const appPlugin = native ? (cap.Plugins?.CoachDiNotifications || cap.registerPlugin?.('CoachDiNotifications')) : null;
  let ready;
  function nativeReady() {
    if (!ready) ready = Promise.resolve(appPlugin?.getBuildInfo?.()).then(info => plugin.initialize({ debugToken: info?.debug === true, isTokenAutoRefreshEnabled: true }));
    return ready;
  }
  function activate(app, webSiteKey) {
    if (native && plugin) {
      app.appCheck().activate({
        async getToken() {
          await nativeReady();
          const result = await plugin.getToken({ forceRefresh: false });
          if (!result?.token || !Number.isFinite(Number(result.expireTimeMillis))) throw new Error('Native App Check token unavailable');
          return { token: result.token, expireTimeMillis: Number(result.expireTimeMillis) };
        },
      }, true);
      void nativeReady().catch(error => console.warn('Native App Check initialization unavailable', error));
      return 'native';
    }
    if (webSiteKey) { app.appCheck().activate(webSiteKey, true); return 'web'; }
    return 'disabled';
  }
  root.CoachDiAppCheck = Object.freeze({ activate });
})(window);
