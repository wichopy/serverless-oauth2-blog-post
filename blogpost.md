### Intro

While working on QUID's core features we're simultaneously testing them out on our own experiemental app ideas. Apps today have the luxury of being able to easily talk to each other using API's. Popular companies such as github, google, and facebook make it really easy for developers to securely access a user's data. The main driving technology behind this is OAuth2.

This post will be looking at how to implement auth in a serverless architecture. One thing to note is I will be using client libraries and not implementing the OAuth2 mechanisms on my own. That will come in a later post.

Its important to note that whenever a third party maintained OAuth2 client is available, it should be used instead of trying to implement it on your own. OAuth2 is a standard but providers may have their own implementations that differ from others. Instead of trying to re invent the wheel I prefer to just hop in the car and drive.

### Pre-Requesites

* If you know nothing about OAuth2, or want a refresher, watch [this video](https://www.youtube.com/watch?v=996OiexHze0)
* Create a [Firebase](https://firebase.google.com/) account.
* Your dev environment will need Node v8 or higher and git.


### Preface
The full source code can be found [here](https://github.com/wichopy/serverless-oauth2-blog-post.git). Branches were made for each section so we can following along with with git diffs. I recommended following along with the blog post/git repo, and trying to implement the flows on your own after.

The flows we will explore:
* Client side authorization
* Client side authenticated API requests
* Server side authenticated API requests
* Client side authenticated API requests using server generated access tokens
* Periodic API calls using Cloud Scheduler.

Lets get started!

### Setup

First you will need to clone the demo repo so we can run things locally.
```bash
    git clone https://github.com/wichopy/serverless-oauth2-blog-post.git
```

Next, make a firebase project. Mine will be called oauth-flows.

![Screen-Shot-2019-04-16-at-12.43.01-AM](/content/images/2019/04/Screen-Shot-2019-04-16-at-12.43.01-AM.png)

Install the firebase cli tool in your dev environment.

```bash
    npm install -g firebase-tools
```

This demo was bootstrapped using `firebase init` to set up the initial config files, html, and cloud function tools.

In the first prompt, select functions, hosting and firestore. In the next prompt, select the project we just made, oauth-flows. The next few prompts will ask you questions based on your personal preferences. I chose the defaults for firestore rules and firestore index, javascript for cloud functions, yes to eslint, yes to installing dependencies, the default public folder for public directory, and yes to single page app.

The github repo's master branch will show what we have after this initialization. We will go into the first branch to see our first flow. 

### Client side authorization

`git checkout google-signin`

https://github.com/wichopy/serverless-oauth2-blog-post/compare/master...google-signin?expand=1

The first flow we will look at will be very simple and will set us up for the later flows. Since we are using firebase, they have a great abstraction that simplifies authorizing your users. It supports integrations with all the major players such as Facebook, Github and Google. Some powerful features include persisted auth sessions and user tables for you to manage your users.

Before being able to use one of the integrations, you must first enable it in the firebase console. Lets enable the Google auth integration by going to Authentication > Sign-in Method > Google in the Firebase console. Click the enable toggle and click save.

![Screen-Shot-2019-04-16-at-12.56.09-AM](/content/images/2019/04/Screen-Shot-2019-04-16-at-12.56.09-AM.png)

Lets implement a flow we are all used to seeing, the pop up sign-in.

```javascript
var provider = new firebase.auth.GoogleAuthProvider();
        
function onSigninClick () {
  firebase.auth().signInWithPopup(provider).then(function (result) {
    console.log('Auth resposne from firebase:', result)
  })
}

function onSignoutClick () {
  firebase.auth().signOut().then(function() {
    console.log('Signout successful')
  })
}
```

Calling the `signInWithPopup` function will open a pop up and ask you for your google credentials. Behind the scenes, the auth code for token exchange happens on the firebase servers which will set up a new user in your user table if one does not exist and set the auth session in your browser. 

The `result` from `signInWithPopup` contains tokens such as the access token, id token and refresh token that we'll use later. 

`result.credentials`:
![Screen-Shot-2019-04-21-at-5.29.45-PM](https://blog.quid.works/content/images/2019/04/Screen-Shot-2019-04-21-at-5.29.45-PM.png)
`result.user`:
![Screen-Shot-2019-04-21-at-5.28.08-PM](https://blog.quid.works/content/images/2019/04/Screen-Shot-2019-04-21-at-5.28.08-PM.png)

#### Access Token 

A short lived token that API's look for when making authenticated requests. This is only returned when a user enters their credentials (typing in the email/password or clicking on the already logged in google account).  The default expiry time for access tokens is 3600 ms (1 hour) but we can customize this to be as long or short as our application needs.

#### Refresh token

A long lived token that can be use with a client secret on your backend to generate new access tokens. A default expiry for a refresh token is 6 months for Google.

#### ID Token

A token to identify a user in the OpenID Connect protocol, the defacto authentication framework used for single sign-on flows. This ID token can be used to authenticate users in different OAuth2 platforms, and to verify our API requests. More on this later.

Why do we have an ID token? If you watched the video linked above, its discussed that OAuth2 was designed for authentication, not authorization. The openID Connect protocol solves the authentication problem by standardizing the authentication data so all systems can talk to eachother the same way.

This is a good intro, lets do some actual API requests now.

### Client side API requests

`git checkout google-api-requests`

https://github.com/wichopy/serverless-oauth2-blog-post/compare/google-signin...google-api-request

Lets use Firebase's google auth implmentation and add additional scopes so we can get an access token that will read from one of google's many apis. In this example, we will read google calendar events.

Before we can do this, we need to add the gapi javascript library to our html and enable the Calendar API in this project.
Add to our `head` tag:
```diff
  + <script src="https://apis.google.com/js/api.js"></script>
```

To add apis to a google / firebase project:
https://console.developers.google.com/apis/library/

Adding an api to a project will let google know that your client ID / api keys will be able to request access to the APIs we enabled.

After enabling, we will need to add the events scope to our google auth provider.

```javascript
        var provider = new firebase.auth.GoogleAuthProvider();
        const calendarEventsScope = 'https://www.googleapis.com/auth/calendar.events.readonly'
        // Add a scope for an api you want to grab data from. In this example we are reading google calendar events for your main calendar.
        provider.addScope(calendarEventsScope);

```

This scope is needed so when the user provides their credentials, they will also be notified of what data you are trying to access, which will give us permission to access their data after they click accept.

This is what the user will see when trying to login after adding the calendar events scope.

![Screen-Shot-2019-04-21-at-5.47.30-PM](https://blog.quid.works/content/images/2019/04/Screen-Shot-2019-04-21-at-5.47.30-PM.png)

![Screen-Shot-2019-04-21-at-5.47.37-PM](https://blog.quid.works/content/images/2019/04/Screen-Shot-2019-04-21-at-5.47.37-PM.png)

Now that we added the scope, we can add the code to make an api request after we get an access token:

```javascript
// This function adds an access token to the google api client if available, otherwise it will ask you for your credentials again.
function authenticateGoogleAPI () {
 return new Promise((resolve, reject) => {
   if (!accessToken) {
     // Reentering the app as a logged in firebase user, we need to reauth to get a new access token.
     firebaseUser.reauthenticateWithPopup(provider).then(result => {
       console.log('reauthenticate result', result)
       accessToken = result.credential.accessToken
       gapi.client.setToken({
         access_token: accessToken
       })
       resolve()
     })
   } else {
     // Already have access token from logging in
     gapi.client.setToken({
       access_token: accessToken
     })
     resolve()
   }
 })
}
/*
* Google API
* */
function onGapiLoad () {
 // Enable the api you want to use in the developer console
 // https://console.developers.google.com/apis/library/
 function fetchData () {
   authenticateGoogleAPI()
     .then(() => {
       return gapi.client.request({
         // Pick an endpoint based on the scope and api you defined.
         path: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
         method: 'GET'
       })
     })
     .then(result => {
       fetchResponse.innerText = result.body
     })
 }
 gapi.client.init({
   'apiKey': 'AIzaSyBWLnDa3OxY_QNenfQ-ikkRNLur9jFsoUA',
   // clientId and scope are optional if auth is not required.
   'clientId': '315834859490-9aibgf8ofbop7h0o050nahkpb01272ac.apps.googleusercontent.com',
   'scope': 'profile https://www.googleapis.com/auth/calendar.events.readonly',
 }).then(function() {
   // 3. Initialize and add an onClick handler to make the API request.
   console.log('google api initialized')
   fetchButton.addEventListener('click', fetchData)
 });
}
// 1. Load the JavaScript client library.
gapi.load('client', onGapiLoad);
```
The key blobs to look at are:

```javascript
  gapi.client.setToken({
    access_token: accessToken
  })
```

and 

```javascript
    return gapi.client.request({
      // Pick an endpoint based on the scope and api you defined.
      path: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      method: 'GET'
    })
```

`setToken` Add the access token to our google client, essentially authenticating it to make api requests.

`request` Uses the access token that we set and adds it to request HEADers for us, abstracting this low level api so we can focus on what we really want, the data.

The request for google calendar events was quite simple but you will need to look up the API you want to interact with to figure out what the request will look like. You may need to include required params in the `body` field in order to have a successful request. You should be able to find what you are looking for with a quick google search. For example, [this](https://developers.google.com/calendar/v3/reference/events/list) is what I used to construct the path seens above.

Did you notice the `authenticateGoogleAPI` function? We only get an access token when we enter our credentials into the pop up. If an auth session exists already when your user reenters the app, they will need to re-enter their credentials in the pop up in order to get a new access token. 

This flow works for some use cases, but most likely we would want our users to just authenticate once and be able to access their data as long as they are logged in. Lets look at how to do this in the next section. 

### Server side API requests 

`git checkout offline-api-requests`

In OAuth2 terms, being able to access a user's data while they are away from the app is called *offline access*. We will use this mechanism to improve our user experience.

On the client, we will use the gapi grantOfflineAccess method to start this flow.
```javascript
function openConsentWindow() {
    gapi.auth2.getAuthInstance().grantOfflineAccess({
      scope: calendarEventsScope
    }).then(res => {
      console.log(res)
    })
}
```

#### cloud functions
We will make our own microservice using cloud functions. These cloud functions can be run in your local env using the firebase cli command `firebase serve --only functions`. We should do all our development using the emulator so we don't eat into our quotas and if you don't have billing set up, your cloud functions cannot make api requests outside of the firebase realm.

Lets take a look at our first cloud function which will be used to accept the access code returned from the grantOfflineAccess response.

```javascript
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
```

Great, we requested for a user's credentials and saved them to our database.
Now whenever we want to access their data, all we need to do is grab the refresh token, pass it to the google api client, and call the api endpoint the token is has available scopes to. This is what it would look like with our calendar events example.

```javascript
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
  // Use VS Code, the intellisense is magical.
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
```

Note, you might have noticed a refresh token is availble on the firebase auth user object o nthe frontend. You can try creating a new access token using this refresh token, but it  will not work with googleapis as firebase took our id token from the google login and made their own token with it.

### Client side authenticated API requests using server generated access tokens

`git checkout request-client-access-token`

Making api calls with cloud functions will add to your free quota. Depending how frequently you want to access these api calls, it might make more sense to let your frontend client make the calls using the method we outlined in Client side API Requests, by passing an access token to the `gapi` client. With our stored refresh token, we can now make access tokens on demand without having to ask the user to reauthenticate.

```
exports.tokens = functions.https.onRequest(async (request, response) => {
  const { idToken } = request.query
  response.set('Access-Control-Allow-Origin', '*');
  if (!idToken) {
    response.status(400).send('Missing id token')
    return
  }

   let uid
  try {
    const userInfo = await extractUid(idToken)
    uid = userInfo.uid
  } catch (err) {
    response.status(400).send('Error verifying id token')
    return
  }

   console.log('uid', uid)

   const user = await app.firestore().collection("users").doc(uid).get()
  if (!user.exists) {
    response.status(400).send('No credentials saved for this user.')
    return
  }

   const refreshToken = user.data().refreshToken
  console.log('refresh token', refreshToken)
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  const accessToken = await oauth2Client.getAccessToken()
  response.send({ accessToken: accessToken.token })
})
```

Now simply use this access token like we did in the Client Side API Requests section, except now we don't need to reauthenticate the user everytime they return to the app!

### Periodic API Requests

We've covered calling API's from a frontend client and on the server, but how about if we want to call an API at a regular interval. An example of this is calling the google fitness API everyday to get a user's previous day's step count for your next awesome fitness app. With cloud functions and GCP's Cloud scheduler it couldn't be any easier.

* Create pubsub cloud func
* Create pubsub topic
* Create cloud scheduler job

### Conclusion

OAuth2 is very difficult when you first start digging into it. I hope these flows will help you get a better grasp of its concepts and help you make some awesome apps. I look forward to any feedback 

Happy hacking!

Will.

Snippets:
Firebase has deep integrations with google cloud platform, giving you tools from either platform to play with.
