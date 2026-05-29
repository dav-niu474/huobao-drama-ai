import pty from 'node-pty';

const teamoBin = '/home/z/.npm-global/bin/teamo';

const proc = pty.spawn(teamoBin, [], {
  name: 'xterm-256color',
  cols: 120,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env,
});

console.log('Teamo process started with PID:', proc.pid);

let output = '';
let step = 0;

proc.onData((data) => {
  output += data;
  // Strip ANSI codes for pattern matching
  const clean = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\].*?\x07/g, '');
  
  if (clean.includes('Subscribe to use Teamo') || clean.includes('VIP subscription')) {
    if (step === 0) {
      step = 1;
      setTimeout(() => {
        console.log('\n[AUTO] Typing /login command...');
        proc.write('/login\r');
      }, 2000);
    }
  }
  
  if (clean.includes('Press Enter') && clean.includes('sign in')) {
    if (step === 1) {
      step = 2;
      setTimeout(() => {
        console.log('\n[AUTO] Pressing Enter to start login...');
        proc.write('\r');
      }, 2000);
    }
  }
  
  if (clean.includes('Login successful') || clean.includes('Logged in as')) {
    if (step === 2) {
      step = 3;
      setTimeout(() => {
        console.log('\n[AUTO] Login successful! Pressing Enter to continue...');
        proc.write('\r');
      }, 2000);
    }
  }
  
  if (clean.includes('Pick your starting agent') || clean.includes('Codex')) {
    if (step === 3) {
      step = 4;
      setTimeout(() => {
        console.log('\n[AUTO] Selecting agent...');
        proc.write('\r');
      }, 2000);
    }
  }
});

proc.onExit(({ exitCode }) => {
  console.log(`\nProcess exited with code: ${exitCode}`);
  process.exit(exitCode || 0);
});

// Timeout after 90 seconds
setTimeout(() => {
  console.log('\n[AUTO] Timeout - saving state and killing process');
  proc.kill();
  
  // Check auth.json
  import('fs').then(fs => {
    try {
      const auth = fs.readFileSync('/home/z/.teamo/auth.json', 'utf8');
      console.log('\nAuth session:', auth);
    } catch(e) {
      console.log('No auth.json found');
    }
  });
  
  process.exit(0);
}, 90000);
