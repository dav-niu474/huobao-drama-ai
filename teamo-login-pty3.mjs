import pty from 'node-pty';
import { writeFileSync, readFileSync } from 'fs';

const teamoBin = '/home/z/.npm-global/bin/teamo';

const proc = pty.spawn(teamoBin, [], {
  name: 'xterm-256color',
  cols: 300,  // Wide terminal to avoid URL wrapping
  rows: 40,
  cwd: process.env.HOME,
  env: process.env,
});

console.log('Teamo process started with PID:', proc.pid);

let fullOutput = '';
let authUrl = null;
let stateParam = null;

proc.onData((data) => {
  fullOutput += data;
  
  // Clean ANSI codes
  const clean = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
  
  // Try to detect OAuth URL
  const urlMatch = clean.match(/https:\/\/teamocode\.com\/oauth\/authorize\?[\S]+/);
  if (urlMatch && !authUrl) {
    authUrl = urlMatch[0];
    console.log('\n[FOUND] OAuth URL:', authUrl);
    
    // Extract state
    const stateMatch = authUrl.match(/state=([^&]+)/);
    if (stateMatch) {
      stateParam = stateMatch[1];
      console.log('[FOUND] State:', stateParam);
    }
    
    // Save URL to file for the outer process to read
    writeFileSync('/home/z/my-project/teamo-oauth-url.txt', authUrl);
    writeFileSync('/home/z/my-project/teamo-oauth-state.txt', stateParam || '');
    console.log('[SAVED] OAuth URL and state saved to files');
  }
});

proc.onExit(({ exitCode }) => {
  console.log(`\nProcess exited with code: ${exitCode}`);
  process.exit(0);
});

// Step 1: Wait 3 seconds then type /login
setTimeout(() => {
  console.log('[CMD] Sending /login...');
  proc.write('/login\r');
}, 3000);

// Step 2: Wait 8 seconds then press Enter to start OAuth
setTimeout(() => {
  console.log('[CMD] Pressing Enter to start OAuth...');
  proc.write('\r');
}, 8000);

// Keep running - we'll paste the code from outside
// Signal file approach: watch for /home/z/my-project/teamo-auth-code.txt
const codeCheckInterval = setInterval(() => {
  try {
    const code = readFileSync('/home/z/my-project/teamo-auth-code.txt', 'utf8').trim();
    if (code && code.length > 10) {
      console.log('[CODE] Found auth code, pasting into TUI...');
      clearInterval(codeCheckInterval);
      
      // First press Enter to retry (since we got an error earlier)
      proc.write('\r');
      
      // Wait a moment then paste the code
      setTimeout(() => {
        proc.write(code + '\r');
        console.log('[CODE] Code pasted, waiting for result...');
        
        // Wait for login success and press Enter
        setTimeout(() => {
          proc.write('\r');
          console.log('[CODE] Pressed Enter after login');
        }, 10000);
      }, 3000);
    }
  } catch (e) {
    // File doesn't exist yet, ignore
  }
}, 2000);

// Timeout after 180 seconds
setTimeout(() => {
  console.log('\n[AUTO] Timeout - killing process');
  clearInterval(codeCheckInterval);
  writeFileSync('/home/z/my-project/teamo-output2.log', fullOutput);
  proc.kill();
  process.exit(0);
}, 180000);
