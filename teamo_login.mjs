import { startTeamoOAuthFlow, parseManualAuthCode } from "/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/oauth.js";

console.log("[*] Starting Teamo OAuth flow...");

try {
  const flow = await startTeamoOAuthFlow();

  console.log("[*] OAuth URL:", flow.automaticUrl);
  console.log("[*] Listener port:", flow.listenerPort);
  console.log("[*] Browser opened:", flow.browserOpened);
  console.log("[*] Browser error:", flow.browserOpenError?.message || "none");
  console.log("");
  console.log("[!] Open the URL above in a browser to complete login.");
  console.log("[*] Waiting for authorization code (timeout: 120s)...");

  // Wait for the callback with a timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("OAuth flow timed out after 120s")), 120000);
  });

  const code = await Promise.race([flow.waitForCode, timeoutPromise]);

  console.log("[*] Got authorization code, exchanging for token...");

  const result = await flow.exchangeCode(code);

  console.log("[✓] Login successful!");
  console.log("    Username:", result.username);
  console.log("    User ID:", result.userId);
  console.log("    Token type:", result.tokenType);
  console.log("    Expires at:", result.expiresAt);

  await flow.cleanup();
  process.exit(0);
} catch (err) {
  console.error("[✗] Error:", err.message);
  process.exit(1);
}
