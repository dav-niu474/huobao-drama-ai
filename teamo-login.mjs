import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const AUTH_BASE_URL = "https://teamocode.com";
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";
const AUTH_FILE = join(homedir(), ".teamo", "auth.json");

function randomToken(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function toCodeChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function createAuthCodeListener(expectedState) {
  let resolved = false;
  let resolveCode;
  const waitForCode = new Promise((resolve) => {
    resolveCode = resolve;
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://${CALLBACK_HOST}`);
    if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state || state !== expectedState) {
      response.statusCode = 400;
      response.end("State mismatch or missing code");
      return;
    }
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<!doctype html><html><body>Teamo CLI login received. You can return to your terminal.</body></html>");
    if (!resolved) {
      resolved = true;
      resolveCode(code);
    }
    setTimeout(() => server.close(), 100);
  });

  await new Promise((resolve) => server.listen(0, CALLBACK_HOST, () => resolve()));
  const address = server.address();
  return {
    port: address.port,
    waitForCode,
    server,
  };
}

async function exchangeCode(code, state, codeVerifier) {
  const response = await fetch(`${AUTH_BASE_URL}/api/cli-auth/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, state, codeVerifier }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Exchange failed: ${response.status} ${text}`);
  }
  return await response.json();
}

async function main() {
  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const codeChallenge = toCodeChallenge(codeVerifier);

  let deviceId = "unknown";
  try {
    const deviceIdPath = join(homedir(), ".teamo", "device-id");
    deviceId = await readFile(deviceIdPath, "utf8");
  } catch {}

  const { port, waitForCode, server } = await createAuthCodeListener(state);
  const callbackUrl = `http://${CALLBACK_HOST}:${port}${CALLBACK_PATH}`;

  const authUrl = new URL(`${AUTH_BASE_URL}/oauth/authorize`);
  authUrl.searchParams.set("client", "teamo-cli");
  authUrl.searchParams.set("deviceId", deviceId.trim());
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("AUTH_URL=" + authUrl.toString());
  console.log("CALLBACK_PORT=" + port);
  console.log("STATE=" + state);
  console.log("CODE_VERIFIER=" + codeVerifier);

  const code = await waitForCode;
  console.log("Received authorization code, exchanging...");

  const result = await exchangeCode(code, state, codeVerifier);
  console.log("Exchange result:", JSON.stringify(result, null, 2));

  const session = {
    accessToken: result.accessToken || result.apiKey || "",
    apiKey: result.apiKey || result.accessToken || "",
    tokenType: result.tokenType || "Bearer",
    issuedAt: result.issuedAt || Math.floor(Date.now() / 1000),
    expiresAt: result.expiresAt || 0,
    userId: result.userId || "",
    username: result.username || "",
    keyId: result.keyId || "",
  };

  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(session, null, 2) + "\n", "utf8");
  console.log("Auth session saved to", AUTH_FILE);

  const profileResponse = await fetch(`${AUTH_BASE_URL}/api/v1/profile`, {
    headers: { "X-API-Key": session.accessToken },
  });
  const profile = await profileResponse.json();
  console.log("Profile:", JSON.stringify(profile, null, 2));

  server.close();
}

main().catch(console.error);
