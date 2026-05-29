import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { resolveTeamoDeviceId } from '/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/infra/teamo-device-id.js';
import { openInBrowser } from '/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/utils/open-browser.js';

const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";

function randomToken(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function toCodeChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function createAuthCodeListener(expectedState) {
  let resolved = false;
  let resolveCode;
  const waitForCode = new Promise((resolve) => { resolveCode = resolve; });
  
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? CALLBACK_PATH, `http://${CALLBACK_HOST}`);
    if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state || state !== expectedState) {
      response.statusCode = 400;
      response.end("Invalid");
      return;
    }
    response.statusCode = 200;
    response.end("Teamo CLI login received. You can return to your terminal.");
    if (!resolved) {
      resolved = true;
      resolveCode(code);
    }
    setTimeout(() => server.close(), 100);
  });
  
  await new Promise((resolve, reject) => {
    server.listen(0, CALLBACK_HOST, () => resolve());
    server.once("error", reject);
  });
  
  const address = server.address();
  return { port: address.port, waitForCode, server };
}

async function main() {
  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const codeChallenge = toCodeChallenge(codeVerifier);
  const deviceId = resolveTeamoDeviceId();
  
  const { port, waitForCode, server } = await createAuthCodeListener(state);
  const callbackUrl = `http://${CALLBACK_HOST}:${port}${CALLBACK_PATH}`;
  
  const authUrl = new URL("https://teamocode.com/oauth/authorize");
  authUrl.searchParams.set("client", "teamo-cli");
  authUrl.searchParams.set("deviceId", deviceId);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  
  const fullUrl = authUrl.toString();
  
  console.log("AUTH_URL=" + fullUrl);
  console.log("STATE=" + state);
  console.log("CODE_VERIFIER=" + codeVerifier);
  console.log("LISTENER_PORT=" + port);
  console.log("DEVICE_ID=" + deviceId);
  
  // Save to files
  writeFileSync('/home/z/my-project/oauth-flow.json', JSON.stringify({
    authUrl: fullUrl,
    state,
    codeVerifier,
    listenerPort: port,
    deviceId,
    callbackUrl,
  }, null, 2));
  
  console.log("WAITING_FOR_CALLBACK");
  
  try {
    const code = await waitForCode;
    console.log("CODE_RECEIVED=" + code);
    
    // Exchange the code
    const response = await fetch("https://teamocode.com/api/cli-auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, state, codeVerifier }),
    });
    
    const result = await response.json();
    console.log("EXCHANGE_RESULT=" + JSON.stringify(result));
    
    // Save auth session
    const { saveStoredTeamoAuthSession } = await import('/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/session-store.js');
    await saveStoredTeamoAuthSession(result);
    console.log("AUTH_SAVED=true");
    console.log("USERNAME=" + result.username);
    
    server.close();
  } catch (err) {
    console.error("ERROR=" + err.message);
    server.close();
    process.exit(1);
  }
}

main().catch(err => {
  console.error("FATAL=" + err.message);
  process.exit(1);
});
