import { saveStoredTeamoAuthSession } from "/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/session-store.js";

const session = {
  accessToken: "sk-teamo-096a228cfc20475a1c79d",  // Need full token
  tokenType: "Bearer",
  userId: "u-6ffb1cdbd355403a9f0e5cdf0505ef19",
  username: "dandushengshidifei@gmail.com",
  issuedAt: 1778742846,
  expiresAt: 0,
};

// Read full token from the file we saved earlier
import { readFile } from "node:fs/promises";
const savedSession = JSON.parse(await readFile("/home/z/.teamo/auth-session.json", "utf8"));
session.accessToken = savedSession.accessToken;

await saveStoredTeamoAuthSession(session);
console.log("[✓] Session saved to ~/.teamo/auth.json");

// Verify
import { loadStoredTeamoAuthSessionSync } from "/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/session-store.js";
const loaded = loadStoredTeamoAuthSessionSync();
console.log("[✓] Verified - Username:", loaded.username, "UserID:", loaded.userId);
