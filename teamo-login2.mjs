import { startTeamoOAuthFlow } from '/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/oauth.js';
import { saveStoredTeamoAuthSession } from '/home/z/.npm-global/lib/node_modules/@teamolab/teamo-cli/dist/src/auth/session-store.js';
import { createServer } from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';

async function main() {
  console.log('Starting Teamo OAuth flow...');
  
  const flow = await startTeamoOAuthFlow();
  
  // Save flow info to a file so we can access it from outside
  writeFileSync('/home/z/my-project/teamo-flow-info.json', JSON.stringify({
    authUrl: flow.automaticUrl,
    listenerPort: flow.listenerPort,
    flowId: flow.flowId,
    state: flow.state,
    codeVerifier: flow.codeVerifier,
  }, null, 2));
  
  console.log('AUTH_URL=' + flow.automaticUrl);
  console.log('STATE=' + flow.state);
  console.log('CODE_VERIFIER=' + flow.codeVerifier);
  console.log('LISTENER_PORT=' + flow.listenerPort);
  console.log('FLOW_STARTED=true');
  
  // Wait for the callback from the browser
  try {
    const code = await flow.waitForCode;
    console.log('CALLBACK_CODE_RECEIVED=' + code);
    
    // Exchange the code
    const result = await flow.exchangeCode(code);
    console.log('EXCHANGE_RESULT=' + JSON.stringify(result));
    
    // Save the auth session
    await saveStoredTeamoAuthSession(result);
    console.log('AUTH_SESSION_SAVED=true');
    console.log('SUCCESS=true');
    
    await flow.cleanup();
  } catch (err) {
    console.error('ERROR=' + err.message);
    await flow.cleanup();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL=' + err.message);
  process.exit(1);
});
