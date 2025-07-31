const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

/**
 * Sets a custom user claim to identify a user as a creator.
 * This function should only be called by an authorized admin.
 * @param {object} data The data passed to the function, expecting `data.email`.
 * @param {object} context The context of the function call, containing auth information.
 * @returns {object} A result object with a success message.
 */
exports.setCreatorRole = functions.https.onCall(async (data, context) => {
  // For production, you would add a check here to ensure only an admin can call this.
  // Example: if (context.auth.token.admin !== true) { ... }
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
    // Get the user by email
    const user = await admin.auth().getUserByEmail(email);
    // Set the custom claim 'creator' to true
    await admin.auth().setCustomUserClaims(user.uid, { creator: true });
    
    return { message: `Success! ${email} has been made a creator.` };
  } catch (error) {
    console.error("Error setting custom claim:", error);
    throw new functions.https.HttpsError("internal", "An error occurred while setting the user role.");
  }
});
