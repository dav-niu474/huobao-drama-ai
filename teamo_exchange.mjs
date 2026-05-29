import { createHash, randomBytes } from "node:crypto";

// Replicate the OAuth flow manually
const authBaseUrl = "https://teamocode.com";

// We need the codeVerifier that was generated for this flow
// Since we started a new flow in the script above, we need to recapture it
// Let's instead use a new approach - start a fresh flow and handle it properly

import { startTeamoOAuthFlow } from "/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/oauth.js";

console.log("[*] Starting fresh OAuth flow...");

const flow = await startTeamoOAuthFlow();
console.log("[*] OAuth URL:", flow.automaticUrl);
console.log("[*] Waiting for browser callback...");
console.log("[*] Port:", flow.listenerPort);

// Wait with timeout
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error("Timeout")), 90000));
});

try {
  const code = await Promise.race([flow.waitForCode, timeoutPromise]);
  console.log("[*] Got code, exchanging...");
  const result = await flow.exchangeCode(code);
  console.log("[✓] SUCCESS!");
  console.log("  Username:", result.username);
  console.log("  Token type:", result.tokenType);
  console.log("  Access token:", result.accessToken ? result.accessToken.substring(0, 20) + "..." : "N/A");
} catch(e) {
  console.error("[✗]", e.message);
}

await flow.cleanup();
process.exit(0);
