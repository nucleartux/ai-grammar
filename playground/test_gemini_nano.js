async function correctSpelling(inputText) {
    // Create a session with the language model or assistant
    const session = await (self.ai.languageModel ?? self.ai.assistant).create({
      systemPrompt: "correct spelling in text, don't add explanations",
    });
  
    // Prepare the prompt with the input text
    const prompt = `correct spelling:\n${inputText}`;
  
    // Get the corrected text from the session
    const correctedText = await session.prompt(prompt);
  
    // Destroy the session to free up resources
    session.destroy();
  
    // Return the corrected text
    return correctedText;
  }
  
  // Example usage:
  correctSpelling("centtraalisation").then(corrected => {
    console.log(corrected); // Output should be the corrected spelling
  });