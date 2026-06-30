import type { CapacitorConfig } from '@capacitor/cli'

// Native shell for the Call Time PWA. Bundles the built web app (webDir=dist);
// on launch the app routes straight to /rolodex (see main.tsx). The native
// contacts plugin (@capacitor-community/contacts) gives iOS/Android the one-tap
// "Allow access to Contacts?" permission the web can't offer.
const config: CapacitorConfig = {
  appId: 'info.redefinepolitics.calltime',
  appName: 'Call Time',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#ce1b2c',
  },
}

export default config
