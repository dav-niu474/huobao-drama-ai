const authBaseUrl = "https://teamocode.com";
const code = "e9ccb9cd777a4f2e80ba1fa73d800ff9";
const state = "RoVUNl_ICBFLA5mD5xqCanaI6i4nEv_I";
const codeVerifier = "61MWT-RU71UHiyP3JYx32elgt_rWqI6Q80gpEWAZpndq8_9e2KuebLJmtweL0n1j";

console.log("[*] Exchanging authorization code for token...");

try {
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
  console.log("[*] Status:", response.status);
  
  if (!response.ok) {
    console.error("[✗] Exchange failed:", text);
    process.exit(1);
  }

  const result = JSON.parse(text);
  console.log("[✓] Login successful!");
  console.log("  Username:", result.username);
  console.log("  UserID:", result.userId);
  console.log("  Token type:", result.tokenType);
  console.log("  Access token:", result.accessToken ? result.accessToken.substring(0, 30) + "..." : "N/A");
  console.log("  Expires at:", result.expiresAt);
  console.log("  Issued at:", result.issuedAt);

  // Now save the session to Teamo's expected location
  const sessionStore = await import("/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/session-store.js");
  
  const sessionData = {
    accessToken: result.accessToken,
    tokenType: result.tokenType || "Bearer",
    expiresAt: result.expiresAt,
    issuedAt: result.issuedAt,
    userId: result.userId,
    username: result.username,
  };

  // Try to save using Teamo's own session store
  if (sessionStore.saveTeamoAuthSession) {
    await sessionStore.saveTeamoAuthSession(sessionData);
    console.log("[✓] Session saved via saveTeamoAuthSession");
  } else if (sessionStore.persistTeamoAuthSession) {
    await sessionStore.persistTeamoAuthSession(sessionData);
    console.log("[✓] Session saved via persistTeamoAuthSession");
  } else {
    // Save manually to the expected file
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const { writeFile, mkdir } = await import("node:fs/promises");
    
    const sessionDir = join(homedir(), ".teamo");
    await mkdir(sessionDir, { recursive: true });
    const sessionPath = join(sessionDir, "auth-session.json");
    await writeFile(sessionPath, JSON.stringify(sessionData, null, 2));
    console.log("[✓] Session saved to", sessionPath);
  }

} catch(err) {
  console.error("[✗] Error:", err.message);
  process.exit(1);
}

process.exit(0);
