/* Public browser configuration only. Never put server keys or private credentials here. */
window.COACH_DI_PUBLIC_CONFIG = Object.freeze({
  vapidPublicKey: "BJrx97rACbHsiVpJ3TXSdrsMwVkg6txRVLh3P7GhKQT_DN6kW13pwOzzQo8PbgMzZZ-yTiDSkh6oY7s2iYxaNzM",
  appCheckSiteKey: "6LdqVawtAAAAAPRA9W3a6g3ceQUF0-0sBGganbSS",
  storageUploadsEnabled: true,
  maxUploadBytes: 5 * 1024 * 1024,
  appUrl: "https://coach-di.netlify.app/",
  subscriptionPriceSatang: 25900,
  subscriptionPeriodDays: 30,
  omisePublicKey: "pkey_test_68xc3mwsuj272a6k7xs",
  omiseCreateChargeUrl: "https://asia-southeast1-coach-di.cloudfunctions.net/createOmiseSubscriptionCharge",
  omiseStatusUrl: "https://asia-southeast1-coach-di.cloudfunctions.net/getOmiseSubscriptionStatus",
  omiseWebhookUrl: "https://asia-southeast1-coach-di.cloudfunctions.net/omiseSubscriptionWebhook"
});
