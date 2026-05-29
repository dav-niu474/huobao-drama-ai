import pty from 'node-pty';
import { resolve } from 'path';

const teamoBin = '/home/z/.npm-global/bin/teamo';

// Spawn teamo in a pseudo-terminal
const proc = pty.spawn(teamoBin, [], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.env.HOME,
  env: process.env,
});

console.log('Teamo process started with PID:', proc.pid);

let output = '';

proc.onData((data) => {
  output += data;
  process.stdout.write(data);
  
  // Detect the login gate and press Enter to start login
  if (data.includes('Press Enter') || data.includes('sign in')) {
    setTimeout(() => {
      console.log('\n[AUTO] Pressing Enter to start login...');
      proc.write('\r');
    }, 1000);
  }
  
  // Detect browser opening message and wait for callback
  if (data.includes('Opening browser') || data.includes('Paste code')) {
    console.log('\n[AUTO] Browser opening detected, waiting for OAuth callback...');
  }
  
  // Detect login success
  if (data.includes('Login successful') || data.includes('Logged in as')) {
    console.log('\n[AUTO] Login detected as successful!');
    setTimeout(() => {
      proc.write('\r'); // Press Enter to continue
    }, 1000);
  }
  
  // Detect mode picker - select first option (Codex)
  if (data.includes('Pick your starting agent')) {
    setTimeout(() => {
      console.log('\n[AUTO] Selecting first agent option...');
      proc.write('\r'); // Press Enter to confirm
    }, 1000);
  }
});

proc.onExit(({ exitCode }) => {
  console.log(`\nProcess exited with code: ${exitCode}`);
  console.log('\nFull output:', output);
  process.exit(exitCode);
});

// Timeout after 60 seconds
setTimeout(() => {
  console.log('\n[AUTO] Timeout - killing process');
  proc.kill();
  process.exit(0);
}, 60000);
