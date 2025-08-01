const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

// Initialize the AI with your API key stored securely in environment variables
// Make sure to set this by running: firebase functions:config:set gemini.key="YOUR_API_KEY"
const genAI = new GoogleGenerativeAI(functions.config().gemini.key);

/**
 * A secure, callable function to generate game ideas using the Gemini API.
 */
exports.generateIdea = functions.https.onCall(async (data, context) => {
  // Check if the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const prompt = data.prompt;
  if (!prompt || typeof prompt !== 'string') {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a 'prompt' argument."
    );
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" }); // Corrected model name
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // The AI returns a markdown JSON block, so we need to clean it up
    const cleanedJson = text.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(cleanedJson);

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Unable to generate idea. Please check server logs."
    );
  }
});

/**
 * Sets a custom user claim to identify a user as a creator.
 * This should only be called by an authorized admin.
 */
exports.setCreatorRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const email = data.email;
  if (!email) {
     throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with an 'email' argument."
    );
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
