require('dotenv').config({ path: '.dev.vars' });
const { program } = require('commander');

program
  .description("Testing harness for prompting Gemini")
  .requiredOption('--prompt <prompt>', "Input prompt");

program.parse();

const options = program.opts();

(async () => {
  console.log("Processing...");

  const apiKey = process.env.GEMINI_API_KEY;
  const { prompt } = options;

  const completionRes = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          },
        ],
        generationConfig: {
          maxOutputTokens: 200,
        },
      }),
    }
  );

  if (completionRes.status === 200) {
    const completionContent = await completionRes.json();
    console.log(JSON.stringify(completionContent, null, 2));

    console.log(completionContent.candidates[0].content.parts[0].text.length)
  } else {
    console.log("Error:", await completionRes.text());
  }
})();
