const functions = require('firebase-functions');
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

// 1. create firestore
// 2. download firebase key file
  // firebase settings > service accounts
// 3. download google api secrets
  // Go to https://console.cloud.google.com/apis/credentials?project=oauth-flows&authuser=3&organizationId=598037646388
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

const googleSecrets = require("./google-secrets.json");
const serviceAccount = require("./oauth-flows-service-key.json");

const clientId = googleSecrets.web.client_id
const clientSecret = googleSecrets.web.client_secret
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

// Wrap callback in a promise.
const getToken = (code) => {
  return new Promise((res, rej) => {
    oauth2Client.getToken(code, (err, token) => {
      if (err) return rej(err)

      return res(token)
    })
  })
}

exports.offlineGrant = functions.https.onRequest(async (request, response) => {
  const { code, uid } = request.query

  if (!code) {
    response.status(400).send('Missing auth code')
    return
  }
  if (!uid) {
    response.status(400).send('Missing uid')
    return
  }

  const token = await getToken(code)

  // Overwrite previous value.
  await app.firestore().collection("users").doc(uid).set({ refreshToken: token.refresh_token })
  console.log('save refresh token in user doc')
  response.send(token)

})

exports.events = functions.https.onRequest(async (request, response) => {
  const { uid } = request.query

  if (!uid) {
    response.status(400).send('Missing uid')
    return
  }

  const user = await app.firestore().collection("users").doc(uid).get()

  const refreshToken = user.data().refreshToken

  oauth2Client.setCredentials({ refresh_token: refreshToken })

  // https://github.com/googleapis/google-api-nodejs-client to find your api.
  // If using VS Code, the intellisense is magical.
  const calendarApiClient = google.calendar({
    version: 'v3' ,
    auth: oauth2Client,
  })


  const events = await calendarApiClient.events.list({
    calendarId: 'primary'
  })

  // For development only, we want to restrict this to allowed origins.
  response.set('Access-Control-Allow-Origin', '*');
  response.send(events.data)
})
