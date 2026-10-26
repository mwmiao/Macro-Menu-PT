// Site configuration. These values are public by design (they end up in the browser either way).
export default {
  version: '2.1.0',
  // Release id; 'dev' is replaced with the commit at image build (see Dockerfile).
  build: 'dev',
  siteUrl: 'https://macro-meals.nuka-drifter.com/',
  // Google OAuth 2.0 Client ID (type "Web application") for optional Drive sync. Leave empty to
  // hide sign-in; everything else keeps working locally. Setup steps are in CLAUDE.md.
  googleClientId: '858395367355-l652f24auu71gb1n7h3m4tobhbrlgjf5.apps.googleusercontent.com',
  // Web3Forms access key for "Report a problem". Reports go to the email the key was created with.
  web3formsKey: '87a4d7c9-593f-44de-a63f-526ef2ac552e',
  reportEmail: 'macromealspt@gmail.com',
};
