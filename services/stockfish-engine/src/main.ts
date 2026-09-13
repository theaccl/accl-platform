import { runProductionEngineService } from '@/services/stockfish-engine/src/runtime';

void runProductionEngineService().catch(() => {
  // Startup failures are intentionally coarse; config, checksum, and UCI details stay internal.
  process.exit(1);
});
