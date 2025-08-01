const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

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
 * A scheduled function to scrape and categorize new game ideas.
 * Runs once every 24 hours.
 */
exports.scrapeAndCategorizeIdeas = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    console.log('Running scheduled idea scraping...');
    const db = admin.firestore();
    const genAI = new GoogleGenerativeAI(functions.config().gemini.key);


    // In a real app, this would fetch live data from an API like Reddit.
    const simulatedPosts = [
        { title: "A rhythm game where you're a blacksmith forging legendary weapons.", selftext: "Each hammer strike has to be on beat to increase the weapon's power. Different songs create different types of weapons." },
        { title: "A cooperative board game about terraforming Mars, but you're all rival corporations secretly sabotaging each other.", selftext: "You have to work together to make the planet habitable, but only one company can come out on top." }
    ];

    for (const post of simulatedPosts) {
        const prompt = `Analyze the following game idea and provide a structured JSON response.
        - **name**: A catchy title for the game idea.
        - **description**: A concise summary of the idea.
        - **category**: Must be one of: "Video Game", "Board Game", "Card Game", "Other".
        - **genre**: A suitable genre for the game.
        - **viability**: An overall market potential score (integer 1-100).
        - **viabilityBreakdown**: An object with three keys:
            - **originality**: How unique is the core concept? (integer 1-100)
            - **marketAppeal**: How broad is the target audience? (integer 1-100)
            - **scope**: How complex would this be to develop? (integer 1-100, where 1 is trivial and 100 is a massive AAA project)

        Game Idea Title: ${post.title}
        Game Idea Description: ${post.selftext}`;

        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const cleanedJson = text.replace(/```json\n?|```/g, "").trim();
            const newIdea = JSON.parse(cleanedJson);

            // Save the new, categorized idea to the public collection
            const ideaRef = db.collection('publicIdeas').doc(newIdea.name);
            await ideaRef.set({ ...newIdea, source: 'Reddit' });
            console.log(`Successfully categorized and saved: ${newIdea.name}`);

        } catch (error) {
            console.error('Error processing post:', post.title, error);
        }
    }
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
