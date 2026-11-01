// The app's settings. tools/fill.mjs writes the name, host, kit and Firebase project here; --web-config adds the web
// app's apiKey and appId (`firebase apps:sdkconfig WEB`). A public client config, not a secret: the Firestore rules
// decide who sees what. Until apiKey is set the app runs only against the local emulators (?emulator on localhost).
// accent: the default look's colour (@core/theme; boot.js), set with --accent.
export const APP = {"name":"todo","title":"Todo","host":"todo.anawj.com","accent":"#dc4c3e"};
export const KIT = 'https://design.flamingbeing.com/v1/';
export const firebaseConfig = {
  "projectId": "flamingbeing-todo",
  "authDomain": "todo.anawj.com",
  "apiKey": "AIzaSyD7rV2C1RLyYrgdub_n3FNyqbgC8kMdpWk",
  "appId": "1:526891832069:web:ad4f8c40325548ac015d6c",
  "storageBucket": "flamingbeing-todo.firebasestorage.app",
  "messagingSenderId": "526891832069"
};
