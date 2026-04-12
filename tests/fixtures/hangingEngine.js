process.stdin.resume();
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  const text = String(chunk);
  if (text.includes('isready')) {
    process.stdout.write('readyok\n');
  }
  // Intentionally never emit bestmove to force timeout handling.
});
