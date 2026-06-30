/**
 * Terminal Worker - Worker Thread
 * 
 * Berjalan sebagai worker thread untuk execute terminal commands
 * tanpa blocking main thread.
 * 
 * Manfaat:
 * - Terminal execution tidak blocking server
 * - User lain tetap bisa chat saat command jalan
 * - Share memory untuk fast I/O
 */

const { parentPort } = require('worker_threads');
const pty = require('node-pty');

// Buffer overflow protection constants
const BUFFER_MAX_SIZE = 1000000;  // 1MB max buffer size
const BUFFER_TRIM_SIZE = 500000;  // Keep last 500KB when trimming

// Track active terminal sessions
const sessions = new Map();

/**
 * Create a new terminal session with PTY process
 * 
 * @param {string} id - Unique session identifier
 * @param {string} [cwd] - Working directory for the terminal (defaults to process.cwd())
 * @param {string} [shell] - Shell command to use (defaults to cmd.exe on Windows, bash otherwise)
 * @returns {{id: string, pid: number}} Session info with ID and process ID
 */
function createSession(id, cwd, shell) {
  const shellCmd = shell || (process.platform === 'win32' ? 'cmd.exe' : 'bash');
  
  const child = pty.spawn(shellCmd, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: cwd || process.cwd(),
    env: { ...process.env, TERM: 'xterm-256color' },
    useConpty: process.platform === 'win32',
  });
  
  const session = {
    id,
    pid: child.pid,
    process: child,
    buffer: '',
    createdAt: Date.now(),
  };
  
  sessions.set(id, session);
  
  // Stream output via node-pty onData
  child.onData((data) => {
    session.buffer += data;
    
    // Prevent buffer overflow by trimming old data when size exceeds limit
    if (session.buffer.length > BUFFER_MAX_SIZE) {
      session.buffer = session.buffer.slice(-BUFFER_TRIM_SIZE);
    }
    
    parentPort.postMessage({
      type: 'output',
      id,
      stream: 'stdout',
      data: data,
    });
  });
  
  // Handle exit via node-pty onExit
  child.onExit(({ exitCode }) => {
    parentPort.postMessage({
      type: 'exit',
      id,
      code: exitCode,
    });
    sessions.delete(id);
  });
  
  return { id, pid: child.pid };
}

/**
 * Write data to an active terminal session
 * 
 * @param {string} id - Session identifier
 * @param {string} data - Data to write to the terminal
 * @returns {{ok: boolean, error?: string}} Result object with success status
 */
function writeSession(id, data) {
  const session = sessions.get(id);
  if (!session) {
    return { ok: false, error: 'Session not found' };
  }
  
  try {
    session.process.write(data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Read the output buffer from a terminal session
 * 
 * @param {string} id - Session identifier
 * @param {boolean} [clear=false] - Whether to clear the buffer after reading
 * @returns {{ok: boolean, buffer?: string, error?: string}} Result with buffer content or error
 */
function readBuffer(id, clear) {
  const session = sessions.get(id);
  if (!session) {
    return { ok: false, error: 'Session not found' };
  }
  
  const buffer = session.buffer;
  if (clear) {
    session.buffer = '';
  }
  
  return { ok: true, buffer };
}

/**
 * Destroy and clean up a terminal session
 * 
 * @param {string} id - Session identifier
 * @returns {{ok: boolean, error?: string}} Result object with success status
 */
function destroySession(id) {
  const session = sessions.get(id);
  if (!session) {
    return { ok: false, error: 'Session not found' };
  }
  
  // Prevent duplicate destroy calls
  if (session.destroying) {
    return { ok: true };
  }
  session.destroying = true;
  
  try {
    session.process.kill();
    sessions.delete(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * List all active terminal sessions
 * 
 * @returns {Array<{id: string, pid: number, createdAt: number, bufferSize: number}>} Array of session info
 */
function listSessions() {
  const list = [];
  for (const [id, session] of sessions) {
    list.push({
      id,
      pid: session.pid,
      createdAt: session.createdAt,
      bufferSize: session.buffer.length,
    });
  }
  return list;
}

// Listen for messages from parent thread
parentPort.on('message', (msg) => {
  const { type, id, payload } = msg;
  
  let result;
  
  try {
    switch (type) {
      case 'create':
        result = createSession(id, payload?.cwd, payload?.shell);
        break;
        
      case 'write':
        result = writeSession(id, payload?.data);
        break;
        
      case 'read':
        result = readBuffer(id, payload?.clear);
        break;
        
      case 'destroy':
        result = destroySession(id);
        break;
        
      case 'list':
        result = listSessions();
        break;
        
      case 'shutdown':
        for (const [sid, session] of sessions) {
          try {
            session.process.kill();
          } catch (error) {
            // Ignore errors during shutdown
          }
        }
        setTimeout(() => process.exit(0), 500);
        break;
        
      default:
        result = { ok: false, error: `Unknown command: ${type}` };
    }
    
    parentPort.postMessage({ type: 'result', id, result });
    
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      id,
      error: error.message,
    });
  }
});

// Signal ready
parentPort.postMessage({ type: 'ready' });
