/*
 * Testing harness for testing gemini prompts.
 */

require('dotenv').config({ path: '.dev.vars' });
const readline = require('node:readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question(`Enter prompt: `, async (prompt) => {
  console.log("Processing...");

  const apiKey = process.env.GEMINI_API_KEY;
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
      }),
    }
  );

  if (completionRes.status === 200) {
    const completionContent = await completionRes.json();
    console.log(JSON.stringify(completionContent, null, 2));
  } else {
    console.log("error: encountered error when querying gemini.");
  }

  rl.close();
});
