import { createHash, randomBytes } from "node:crypto";
import { saveStoredTeamoAuthSession } from '/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/session-store.js';

// These are from the first OAuth flow
const state = "rzLsWtWcZcZrMG7dRHSonLeLpJu77o4h";
const authCode = "ffbbd4e8f1f74166a55df60e2645c792";

// We need the codeVerifier that was used to generate the code_challenge
// But we don't have it since it was generated inside the first flow process
// Let me try exchanging without the proper codeVerifier - this will likely fail

// Actually, let me check if the first process is still running
console.log("Checking if first OAuth process is still alive...");

// The exchange endpoint
const authBaseUrl = "https://teamocode.com";

async function exchangeCode(code, state, codeVerifier) {
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
  
  return JSON.parse(text);
}

// We need the codeVerifier from the first flow. Let me try a different approach.
// Since we can't get the codeVerifier, let me try the approach of starting a fresh flow
// and using the browser to authorize with the new flow's URL, then capture the new code.

console.log("The codeVerifier from the first flow is lost. Need to restart the flow.");
console.log("Will start a new OAuth flow and use agent-browser to complete it.");

process.exit(1);
