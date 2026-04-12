declare module 'stockfish' {
  const initEngine: (enginePath?: string) => Promise<{
    sendCommand: (cmd: string) => void;
    listener?: (line: string) => void;
    terminate?: () => void;
  }>;
  export default initEngine;
}
