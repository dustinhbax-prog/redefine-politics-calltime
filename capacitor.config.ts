import type { CapacitorConfig } from '@capacitor/cli'

// Native shell for the Call Time PWA. Bundles the built web app (webDir=dist);
// on launch the app routes straight to /rolodex (see main.tsx). The native
// contacts plugin (@capacitor-community/contacts) gives iOS/Android the one-tap
// "Allow access to Contacts?" permission the web can't offer.
const config: CapacitorConfig = {
  appId: 'info.redefinepolitics.calltime',
  appName: 'ReDefine Call Time',
  webDir: 'dist',
  // Load the app from the live site INSIDE the native shell. This keeps the web
  // content same-origin with the API (so /api/* calls reach the backend — a
  // bundled capacitor://localhost origin can't) while the native Contacts plugin
  // still bridges in (isNativePlatform() stays true). Bonus: web deploys update
  // the app instantly, no new TestFlight build needed for UI changes.
  server: {
    url: 'https://app.redefinepolitics.info/rolodex',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#ce1b2c',
  },
}

export default config
