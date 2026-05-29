// Manual OAuth code exchange using the code we got from the browser
const authBaseUrl = "https://teamocode.com";
const code = "0ff09470ba7542bc8bbfd9ec8ccabf1b";
const state = "Qqwx_Zkt7uf_gSsxVU4qgLvhONnNwu9B";

// We don't have the codeVerifier from the first flow, but we can try to find it
// The first flow was started by teamo_login.mjs - let's check if it saved anything
// Actually, the code verifier was generated in that process and we can't recover it

// Better approach: Start a NEW OAuth flow, get the URL, open it in browser,
// authorize, and capture the callback this time by having the local server running

import { startTeamoOAuthFlow } from "/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/oauth.js";
import { openInBrowser } from "/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/utils/open-browser.js";

console.log("[*] Starting new OAuth flow...");
const flow = await startTeamoOAuthFlow();
console.log("[*] OAuth URL:", flow.automaticUrl);
console.log("[*] Port:", flow.listenerPort);
console.log("[*] codeVerifier:", flow.codeVerifier);
console.log("");
console.log("[*] Waiting for callback (the browser needs to redirect to 127.0.0.1:" + flow.listenerPort + ")...");

const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error("Timeout after 90s")), 90000);
});

try {
  const code = await Promise.race([flow.waitForCode, timeoutPromise]);
  console.log("[*] Got code:", code.substring(0, 10) + "...");
  const result = await flow.exchangeCode(code);
  console.log("[✓] Login successful!");
  console.log("  Username:", result.username);
  console.log("  UserID:", result.userId);
  console.log("  Token type:", result.tokenType);
  console.log("  Access token:", result.accessToken ? result.accessToken.substring(0, 30) + "..." : "N/A");
  console.log("  Expires at:", result.expiresAt);
} catch(e) {
  console.error("[✗] Error:", e.message);
  console.log("[*] The browser callback couldn't reach 127.0.0.1 because agent-browser runs in a different network context");
}

await flow.cleanup();
process.exit(0);
