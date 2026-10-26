// Site configuration. These values are public by design (they end up in the browser either way).
export default {
  version: '2.0.0',
  siteUrl: 'https://macro-meals.nuka-drifter.com/',
  // Google OAuth 2.0 Client ID (type "Web application") for optional Drive sync. Leave empty to
  // hide sign-in; everything else keeps working locally. Setup steps are in CLAUDE.md.
  googleClientId: '',
  // Web3Forms access key for "Report a problem". Reports go to the email the key was created with.
  web3formsKey: '87a4d7c9-593f-44de-a63f-526ef2ac552e',
  reportEmail: 'macromealspt@gmail.com',
};
