const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();
const db = admin.firestore();

/**
 * A secure, callable function to generate game ideas using the Gemini API.
 */
exports.generateIdea = functions.https.onCall(async (data, context) => {
  // Lazily initialize the AI only when this function is called.
  const genAI = new GoogleGenerativeAI(functions.config().gemini.key);

  // Check if the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const prompt = data.prompt;
  if (!prompt || typeof prompt !== 'string') {
    throw new functions.https.HttpsError("invalid-argument", "The function must be called with a 'prompt' argument.");
  }
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const cleanedJson = text.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(cleanedJson);
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new functions.https.HttpsError("internal", "Unable to generate idea. Please check server logs.");
  }
});

/**
 * A scheduled function that resets the free generation count for all non-subscribed users on the 1st of every month.
 */
exports.resetMonthlyGenerations = functions.pubsub.schedule('1 of month 00:00').onRun(async (context) => {
    console.log('Running monthly generation reset for free users.');
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('subscriptionTier', '==', 'free').get();

    if (snapshot.empty) {
        console.log('No free users found to reset.');
        return null;
    }

    const batch = db.batch();
    snapshot.forEach(doc => {
        batch.update(doc.ref, { generationsRemaining: 1 });
    });

    await batch.commit();
    console.log(`Reset 1 free generation for ${snapshot.size} users.`);
    return null;
});


/**
 * Sets a custom user claim to identify a user as a creator.
 */
exports.setCreatorRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const email = data.email;
  if (!email) {
     throw new functions.https.HttpsError("invalid-argument", "The function must be called with an 'email' argument.");
  }
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { creator: true });
    return { message: `Success! ${email} has been made a creator.` };
  } catch (error) {
    console.error("Error setting custom claim:", error);
    throw new functions.https.HttpsError("internal", "An error occurred while setting the user role.");
  }
});

/**
 * Creates a Stripe Checkout session for a user to purchase generations.
 */
exports.createStripeCheckoutSession = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to make a purchase.");
    }

    // Lazily initialize Stripe only when this function is called.
    const stripe = require("stripe")(functions.config().stripe.secret_key);
    const { priceId } = data;
    const userId = context.auth.uid;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription', // or 'payment' for one-time purchases
            line_items: [{
                price: priceId,
                quantity: 1,
            }],
            success_url: `${context.rawRequest.headers.origin}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${context.rawRequest.headers.origin}`,
            client_reference_id: userId,
        });

        return { sessionId: session.id };
    } catch (error) {
        console.error("Stripe session creation failed:", error);
        throw new functions.https.HttpsError("internal", "Could not create a Stripe session.");
    }
});
