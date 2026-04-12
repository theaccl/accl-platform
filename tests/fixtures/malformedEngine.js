process.stdin.resume();
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  const text = String(chunk);
  if (text.includes('isready')) {
    process.stdout.write('readyok\n');
  }
  if (text.includes('go depth')) {
    process.stdout.write('info depth 8 multipv 1 pv e2e4\n');
    process.stdout.write('bestmove (none)\n');
  }
});
