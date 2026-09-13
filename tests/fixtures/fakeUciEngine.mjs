import readline from 'node:readline';

const mode = process.argv[2] || 'healthy';
let searching = false;

if (mode === 'ignore-sigterm') {
  process.on('SIGTERM', () => {});
}

const send = (line) => process.stdout.write(`${line}\n`);

readline.createInterface({ input: process.stdin }).on('line', (command) => {
  if (command === 'uci') {
    if (mode === 'burst-uci') {
      send('id name Stockfish 18');
      send('id author Stockfish developers');
      send('option name EvalFile type string default nn-c288c895ea92.nnue');
      send('option name EvalFileSmall type string default nn-37f18f62d772.nnue');
      for (let index = 0; index < 120; index += 1) {
        send(`option name Burst${String(index).padStart(3, '0')} type string default ${'x'.repeat(64)}`);
      }
      send('uciok');
      return;
    }
    if (mode === 'long-line') {
      send('id name Stockfish 18');
      send('id author Stockfish developers');
      send('option name EvalFile type string default nn-c288c895ea92.nnue');
      send('option name EvalFileSmall type string default nn-37f18f62d772.nnue');
      process.stdout.write(`uciok\n${'x'.repeat(8193)}`);
      return;
    }
    send(mode === 'wrong-identity' ? 'id name Other Engine' : 'id name Stockfish 18');
    send('id author Stockfish developers');
    send('option name EvalFile type string default nn-c288c895ea92.nnue');
    send('option name EvalFileSmall type string default nn-37f18f62d772.nnue');
    send('uciok');
    return;
  }
  if (command === 'isready') {
    if (mode !== 'hang-ready') send('readyok');
    return;
  }
  if (command.startsWith('go ')) {
    searching = true;
    if (mode === 'crash-on-go') process.exit(17);
    if (mode === 'respond-search') {
      searching = false;
      send('info depth 8 multipv 1 score cp 23 pv e2e4 e7e5');
      send('bestmove e2e4');
    }
    return;
  }
  if (command === 'stop' && searching) {
    searching = false;
    if (mode !== 'hang-stop') send('bestmove e2e4');
  }
});
