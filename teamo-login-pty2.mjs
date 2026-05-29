import pty from 'node-pty';
import { writeFileSync } from 'fs';

const teamoBin = '/home/z/.npm-global/bin/teamo';

const proc = pty.spawn(teamoBin, [], {
  name: 'xterm-256color',
  cols: 120,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env,
});

console.log('Teamo process started with PID:', proc.pid);

let fullOutput = '';
let commands = [];

// Schedule commands
// 1. Wait 3 seconds then type /login
setTimeout(() => {
  console.log('[CMD] Sending /login...');
  proc.write('/login\r');
}, 3000);

// 2. Wait 8 seconds then check output and press Enter if needed
setTimeout(() => {
  console.log('[CMD] Sending Enter...');
  proc.write('\r');
}, 8000);

// 3. Wait 15 seconds - by this time OAuth should be in progress
setTimeout(() => {
  const clean = fullOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\].*?\x07/g, '');
  console.log('[CHECK] Current state contains "Opening browser":', clean.includes('Opening browser'));
  console.log('[CHECK] Current state contains "Login successful":', clean.includes('Login successful'));
  console.log('[CHECK] Current state contains "Logged in":', clean.includes('Logged in'));
  console.log('[CHECK] Current state contains "Paste code":', clean.includes('Paste code'));
  console.log('[CHECK] Current state contains "sign in":', clean.includes('sign in'));
}, 15000);

// 4. Wait 30 seconds then send Enter for login success confirmation
setTimeout(() => {
  console.log('[CMD] Sending Enter for success confirmation...');
  proc.write('\r');
}, 30000);

// 5. Exit after 45 seconds
setTimeout(() => {
  // Save full output
  writeFileSync('/home/z/my-project/teamo-output.log', fullOutput);
  console.log('\n[END] Full output saved to teamo-output.log');
  
  // Strip ANSI and show relevant portions
  const clean = fullOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\].*?\x07/g, '');
  const lines = clean.split('\n').filter(l => l.trim());
  console.log('\n[END] Relevant output lines:');
  lines.forEach(l => console.log('  ', l));
  
  proc.kill();
  process.exit(0);
}, 45000);

proc.onData((data) => {
  fullOutput += data;
});

proc.onExit(({ exitCode }) => {
  console.log(`\nProcess exited with code: ${exitCode}`);
  process.exit(0);
});
