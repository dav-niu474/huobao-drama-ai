import { saveStoredTeamoAuthSession } from '/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/session-store.js';

const authBaseUrl = "https://teamocode.com";
const code = "50ece6d8399f4716a480ae5f52a9528e";
const state = "Qaq8SLKEJ04aJBRfGKQzIuJVOY1SYRoT";
const codeVerifier = "T2AvEdYFoS669ze7364tDzvkZLg7Ci6gzxXqzzohshMr_nakjwaGsG9Tr3q3SUEP";

async function exchangeCode() {
  console.log("Exchanging authorization code...");
  console.log("Code:", code);
  console.log("State:", state);
  
  const response = await fetch(`${authBaseUrl}/api/cli-auth/exchange`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      code: code,
      state: state,
      codeVerifier: codeVerifier,
    }),
  });
  
  const text = await response.text();
  console.log("Response status:", response.status);
  console.log("Response body:", text);
  
  if (!response.ok) {
    throw new Error(`Exchange failed: ${response.status} ${text}`);
  }
  
  const result = JSON.parse(text);
  
  // Save the auth session
  await saveStoredTeamoAuthSession(result);
  console.log("Auth session saved successfully!");
  console.log("Username:", result.username);
  console.log("UserId:", result.userId);
}

exchangeCode().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
