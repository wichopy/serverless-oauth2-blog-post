const functions = require('firebase-functions');

// 1. create firestore
// 2. download firebase key file
// firebase settings > service accounts
// 3. download google api secrets
// Go to https://console.cloud.google.com/apis/credentials?project=oauth-flows
// Go to client ID for web app
// Copy client secret and client id (download JSON)
// 4. init clients (firebase and google apis)
// 5. exchange code for tokens
// 6. Save refresh token.
// 7. Make data fetch endpoint
// 8. Pass refresh token as credential to oauth client
// 9. Pass oauth client to google api constructor.
// 10. Call api using oogle api client
// 11. Send back to web client.

const admin = require("firebase-admin");
const { google } = require('googleapis');

// https://console.cloud.google.com/apis/credentials/oauthclient/
const googleSecrets = require("./google-secrets.json");
// https://console.firebase.google.com/project/oauth-flows/settings/serviceaccounts/adminsdk
const serviceAccount = require("./oauth-flows-service-key.json");

const clientId = googleSecrets.web.client_id;
const clientSecret = googleSecrets.web.client_secret;
// Don't use an actual redirect uri from our list of valid uri's. Instead, it needs to be postmessage.
// https://stackoverflow.com/a/48121098/7621726
const redirectUri = 'postmessage'

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://oauth-flows.firebaseio.com"
});

// Helpers
const getToken = (code) => {
  return new Promise((res, rej) => {
    oauth2Client.getToken(code, (err, token) => {
      if (err) return rej(err)

      return res(token)
    })
  })
}

const authorize = async (req, res) => {
  // https://github.com/firebase/functions-samples/blob/master/authorized-https-endpoint/functions/index.js
  console.log('Check if request is authorized with Firebase ID token');

  if ((!req.headers.authorization || !req.headers.authorization.startsWith('Bearer '))) {
    console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.',
      'Make sure you authorize your request by providing the following HTTP header:',
      'Authorization: Bearer <Firebase ID Token>');
    res.status(403).send('Unauthorized');
    return;
  }

  let idToken;
  idToken = req.headers.authorization.split('Bearer ')[1];

  try {
    const decodedIdToken = await app.auth().verifyIdToken(idToken)
    console.log('ID Token correctly decoded', decodedIdToken);
    req.user = decodedIdToken;
    return decodedIdToken;
  } catch (error) {
    console.error('Error while verifying Firebase ID token:', error);
    res.status(403).send('Unauthorized');
    return;
  }
}

// Cloud Functions
exports.offlineGrant = functions.https.onRequest(async (request, response) => {
  const authUser = await authorize(request, response)

  if (!authUser) {
    return
  }

  const { code } = request.query
  response.set('Access-Control-Allow-Origin', '*');
  if (!code) {
    response.status(400).send('Missing auth code')
    return
  }

  const uid = authUser.uid

  console.log('Users uid:', uid)

  const token = await getToken(code)

  // Overwrite previous value.
  await app.firestore().collection("users").doc(uid).set({ refreshToken: token.refresh_token })
  console.log('save refresh token in user doc with uid', uid)
  response.send(token)

})

exports.events = functions.https.onRequest(async (request, response) => {
  const authUser = await authorize(request, response)

  if (!authUser) {
    return
  }

  response.set('Access-Control-Allow-Origin', '*');
  const uid = authUser.uid

  console.log('Users uid:', uid)

  const user = await app.firestore().collection("users").doc(uid).get();
  console.log('Saved user:', user)
  if (!user.exists) {
    response.status(400).send('No credentials saved for this user.')
    return
  }

  const refreshToken = user.data().refreshToken
  console.log('refresh token', refreshToken)
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  // https://github.com/googleaps/google-api-nodejs-client to find your api.
  // If using VS Code, the intellisense is magical.
  const calendarApiClient = google.calendar({
    //   // For development only, we want to restrict this to allowed origins.
    //   response.set('Access-Control-Allow-Origin', '*');
    //   response.send(events.data)
    // })
    version: 'v3',
    auth: oauth2Client,
  })

  let events
  try {
    events = await calendarApiClient.events.list({
      calendarId: 'primary'
    })
  } catch (err) {
    console.error(err)
  }

  // For development only, we want to restrict this to allowed origins.
  response.send(events.data)
})
