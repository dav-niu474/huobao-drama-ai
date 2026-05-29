import pty from 'node-pty';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';

const teamoBin = '/home/z/.npm-global/bin/teamo';

const proc = pty.spawn(teamoBin, [], {
  name: 'xterm-256color',
  cols: 500,
  rows: 50,
  cwd: process.env.HOME,
  env: {
    ...process.env,
    TEAMO_COMMERCE_DEBUG_LOG: '/home/z/my-project/teamo-debug.log',
  },
});

let fullOutput = '';
let oauthUrlFound = false;

proc.onData((data) => {
  fullOutput += data;
  
  // Look for the OAuth URL in the data
  const combined = fullOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  
  // Try to find the URL pattern
  const match = combined.match(/https:\/\/teamocode\.com\/oauth\/authorize\?[A-Za-z0-9_%\-&=.]+/);
  if (match && !oauthUrlFound) {
    oauthUrlFound = true;
    const url = match[0];
    console.log('[FOUND] Full OAuth URL:', url);
    writeFileSync('/home/z/my-project/teamo-oauth-url-full.txt', url);
  }
});

// Step 1: /login after 3 seconds
setTimeout(() => {
  console.log('[CMD] Sending /login...');
  proc.write('/login\r');
}, 3000);

// Step 2: Press Enter after 7 seconds
setTimeout(() => {
  console.log('[CMD] Pressing Enter to start login flow...');
  proc.write('\r');
}, 7000);

// Step 3: Wait for OAuth URL to be found, then signal
setTimeout(() => {
  console.log('[STATUS] OAuth URL found:', oauthUrlFound);
  if (oauthUrlFound) {
    console.log('[NEXT] Please open the URL from /home/z/my-project/teamo-oauth-url-full.txt in the browser');
  }
  
  // Watch for auth code file
  const checkInterval = setInterval(() => {
    try {
      const code = readFileSync('/home/z/my-project/teamo-auth-code.txt', 'utf8').trim();
      if (code && code.length > 10) {
        console.log('[CODE] Pasting auth code into TUI...');
        clearInterval(checkInterval);
        
        // Press Enter to retry first (since there was likely an error)
        proc.write('\r');
        setTimeout(() => {
          // Type the code character by character
          for (const char of code) {
            proc.write(char);
          }
          setTimeout(() => {
            proc.write('\r');
            console.log('[CODE] Code submitted!');
          }, 500);
        }, 2000);
      }
    } catch (e) {
      // Not yet
    }
  }, 1000);
  
  // Save output periodically
  const saveInterval = setInterval(() => {
    writeFileSync('/home/z/my-project/teamo-pty-output.txt', fullOutput);
  }, 5000);
  
  // Exit after 120 seconds
  setTimeout(() => {
    clearInterval(saveInterval);
    writeFileSync('/home/z/my-project/teamo-pty-output.txt', fullOutput);
    proc.kill();
    process.exit(0);
  }, 120000);
}, 15000);

proc.onExit(({ exitCode }) => {
  console.log(`Process exited with code: ${exitCode}`);
  process.exit(0);
});
