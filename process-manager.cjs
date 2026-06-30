/**
 * Process Manager - Orchestrates Child Processes & Worker Threads
 * 
 * Mengelola:
 * - Agent Runner (child process) - untuk agent tasks
 * - Terminal Worker (worker thread) - untuk terminal execution
 * 
 * Fitur:
 * - Auto-restart saat crash
 * - Health monitoring
 * - Graceful shutdown
 * - Task queueing
 */

const { fork } = require('child_process');
const { Worker } = require('worker_threads');
const path = require('path');
const { dlog } = require('./agent/debug.cjs');

class ProcessManager {
  constructor() {
    this.agentRunner = null;
    this.terminalWorker = null;
    this.taskQueue = [];
    this.pendingTasks = new Map();
    this.taskIdCounter = 0;
    this.restartCount = 0;
    this.maxRestarts = 5;
    this.restartWindow = 60000; // 1 minute
    this.restartTimestamps = [];
    this.isShuttingDown = false;
    
    // Health check interval
    this.healthCheckInterval = null;
  }

  /**
   * Initialize all processes
   */
  async start() {
    dlog('process-manager', 'info', 'starting process manager');
    
    await this.spawnAgentRunner();
    await this.spawnTerminalWorker();
    
    // Start health checks
    this.healthCheckInterval = setInterval(() => {
      this.healthCheck();
    }, 30000); // Every 30 seconds
    
    dlog('process-manager', 'info', 'process manager started');
  }

  /**
   * Spawn agent runner child process
   */
  async spawnAgentRunner() {
    return new Promise((resolve, reject) => {
      const runnerPath = path.join(__dirname, 'agent-runner.cjs');
      
      dlog('process-manager', 'info', 'spawning agent runner', { path: runnerPath });
      
      this.agentRunner = fork(runnerPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      
      // Handle stdout/stderr
      this.agentRunner.stdout.on('data', (data) => {
        dlog('agent-runner', 'stdout', data.toString().trim());
      });
      
      this.agentRunner.stderr.on('data', (data) => {
        dlog('agent-runner', 'stderr', data.toString().trim());
      });
      
      // Handle IPC messages
      this.agentRunner.on('message', (msg) => {
        this.handleAgentMessage(msg);
      });
      
      // Handle exit
      this.agentRunner.on('exit', (code, signal) => {
        dlog('process-manager', 'warn', 'agent runner exited', { code, signal });
        
        if (!this.isShuttingDown) {
          this.handleAgentCrash();
        }
      });
      
      // Handle errors
      this.agentRunner.on('error', (error) => {
        dlog('process-manager', 'error', 'agent runner error', { error: error.message });
      });
      
      // Wait for ready signal
      const readyHandler = (msg) => {
        if (msg.type === 'ready') {
          this.agentRunner.removeListener('message', readyHandler);
          dlog('process-manager', 'info', 'agent runner ready', { pid: this.agentRunner.pid });
          resolve();
        }
      };
      
      this.agentRunner.on('message', readyHandler);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        this.agentRunner.removeListener('message', readyHandler);
        reject(new Error('agent runner startup timeout'));
      }, 10000);
    });
  }

  /**
   * Spawn terminal worker thread
   */
  async spawnTerminalWorker() {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'terminal-worker.cjs');
      
      dlog('process-manager', 'info', 'spawning terminal worker', { path: workerPath });
      
      this.terminalWorker = new Worker(workerPath);
      
      // Handle messages
      this.terminalWorker.on('message', (msg) => {
        this.handleTerminalMessage(msg);
      });
      
      // Handle errors
      this.terminalWorker.on('error', (error) => {
        dlog('process-manager', 'error', 'terminal worker error', { error: error.message });
      });
      
      // Handle exit
      this.terminalWorker.on('exit', (code) => {
        dlog('process-manager', 'warn', 'terminal worker exited', { code });
        
        if (!this.isShuttingDown) {
          this.handleTerminalCrash();
        }
      });
      
      // Wait for ready signal
      const readyHandler = (msg) => {
        if (msg.type === 'ready') {
          this.terminalWorker.removeListener('message', readyHandler);
          dlog('process-manager', 'info', 'terminal worker ready');
          resolve();
        }
      };
      
      this.terminalWorker.on('message', readyHandler);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        this.terminalWorker.removeListener('message', readyHandler);
        reject(new Error('terminal worker startup timeout'));
      }, 10000);
    });
  }

  /**
   * Handle messages from agent runner
   */
  handleAgentMessage(msg) {
    if (msg.type === 'stream') {
      // Forward stream data to pending task
      const task = this.pendingTasks.get(msg.taskId);
      if (task && task.onStream) {
        task.onStream(msg.data);
      }
      return;
    }
    
    if (msg.type === 'error') {
      dlog('process-manager', 'error', 'agent runner reported error', { error: msg.error });
      return;
    }
    
    // Task result
    if (msg.id && this.pendingTasks.has(msg.id)) {
      const task = this.pendingTasks.get(msg.id);
      this.pendingTasks.delete(msg.id);
      
      if (msg.ok) {
        task.resolve(msg.result);
      } else {
        task.reject(new Error(msg.error));
      }
    }
  }

  /**
   * Handle messages from terminal worker
   */
  handleTerminalMessage(msg) {
    if (msg.type === 'output') {
      // Forward terminal output
      const task = this.pendingTasks.get(`term-${msg.id}`);
      if (task && task.onOutput) {
        task.onOutput(msg.data, msg.stream);
      }
      return;
    }
    
    if (msg.type === 'exit') {
      // Terminal session exited
      const task = this.pendingTasks.get(`term-${msg.id}`);
      if (task && task.onExit) {
        task.onExit(msg.code);
      }
      this.pendingTasks.delete(`term-${msg.id}`);
      return;
    }
    
    if (msg.type === 'error') {
      dlog('process-manager', 'error', 'terminal worker reported error', { id: msg.id, error: msg.error });
      return;
    }
    
    // Command result
    if (msg.id && this.pendingTasks.has(msg.id)) {
      const task = this.pendingTasks.get(msg.id);
      this.pendingTasks.delete(msg.id);
      
      if (msg.result.ok) {
        task.resolve(msg.result);
      } else {
        task.reject(new Error(msg.result.error));
      }
    }
  }

  /**
   * Handle agent runner crash
   */
  async handleAgentCrash() {
    const now = Date.now();
    this.restartTimestamps = this.restartTimestamps.filter(t => now - t < this.restartWindow);
    
    if (this.restartTimestamps.length >= this.maxRestarts) {
      dlog('process-manager', 'error', 'agent runner crash loop detected, not restarting');
      return;
    }
    
    this.restartTimestamps.push(now);
    this.restartCount++;
    
    dlog('process-manager', 'warn', 'restarting agent runner', { attempt: this.restartCount });
    
    try {
      await this.spawnAgentRunner();
      
      // Re-queue pending tasks
      for (const [id, task] of this.pendingTasks) {
        if (task.type === 'agent') {
          this.taskQueue.push({ id, ...task.payload });
        }
      }
      
      this.processQueue();
      
    } catch (error) {
      dlog('process-manager', 'error', 'failed to restart agent runner', { error: error.message });
    }
  }

  /**
   * Handle terminal worker crash
   */
  async handleTerminalCrash() {
    dlog('process-manager', 'warn', 'restarting terminal worker');
    
    try {
      await this.spawnTerminalWorker();
    } catch (error) {
      dlog('process-manager', 'error', 'failed to restart terminal worker', { error: error.message });
    }
  }

  /**
   * Submit agent task
   */
  submitAgentTask(type, payload, onStream) {
    return new Promise((resolve, reject) => {
      const id = ++this.taskIdCounter;
      
      this.pendingTasks.set(id, {
        type: 'agent',
        payload: { type, payload },
        resolve,
        reject,
        onStream,
      });
      
      this.taskQueue.push({ id, type, payload });
      this.processQueue();
    });
  }

  /**
   * Submit terminal command
   */
  submitTerminalCommand(command, onOutput, onExit) {
    return new Promise((resolve, reject) => {
      const id = `term-${++this.taskIdCounter}`;
      
      this.pendingTasks.set(id, {
        type: 'terminal',
        resolve,
        reject,
        onOutput,
        onExit,
      });
      
      this.terminalWorker.postMessage({
        type: 'create',
        id,
        payload: { command },
      });
    });
  }

  /**
   * Process task queue
   */
  processQueue() {
    if (!this.agentRunner || this.taskQueue.length === 0) {
      return;
    }
    
    const task = this.taskQueue.shift();
    
    try {
      this.agentRunner.send({
        type: 'task',
        id: task.id,
        type: task.type,
        payload: task.payload,
      });
    } catch (error) {
      dlog('process-manager', 'error', 'failed to send task', { error: error.message });
      
      // Re-queue task
      this.taskQueue.unshift(task);
    }
  }

  /**
   * Health check
   */
  healthCheck() {
    const status = {
      agentRunner: this.agentRunner ? {
        pid: this.agentRunner.pid,
        connected: this.agentRunner.connected,
        killed: this.agentRunner.killed,
      } : null,
      terminalWorker: this.terminalWorker ? {
        threadId: this.terminalWorker.threadId,
      } : null,
      pendingTasks: this.pendingTasks.size,
      queuedTasks: this.taskQueue.length,
      restartCount: this.restartCount,
    };
    
    dlog('process-manager', 'info', 'health check', status);
    
    // Check for stuck tasks
    const now = Date.now();
    for (const [id, task] of this.pendingTasks) {
      if (task.createdAt && now - task.createdAt > 300000) { // 5 minutes
        dlog('process-manager', 'warn', 'stuck task detected', { id, age: now - task.createdAt });
      }
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    dlog('process-manager', 'info', 'shutting down process manager');
    this.isShuttingDown = true;
    
    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Shutdown agent runner
    if (this.agentRunner) {
      try {
        this.agentRunner.send({ type: 'shutdown' });
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.agentRunner.kill();
      } catch (error) {
        dlog('process-manager', 'error', 'error shutting down agent runner', { error: error.message });
      }
    }
    
    // Shutdown terminal worker
    if (this.terminalWorker) {
      try {
        this.terminalWorker.postMessage({ type: 'shutdown' });
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.terminalWorker.terminate();
      } catch (error) {
        dlog('process-manager', 'error', 'error shutting down terminal worker', { error: error.message });
      }
    }
    
    // Reject all pending tasks
    for (const [id, task] of this.pendingTasks) {
      task.reject(new Error('process manager shutting down'));
    }
    this.pendingTasks.clear();
    
    dlog('process-manager', 'info', 'process manager shutdown complete');
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      agentRunner: this.agentRunner ? {
        pid: this.agentRunner.pid,
        connected: this.agentRunner.connected,
      } : null,
      terminalWorker: this.terminalWorker ? {
        threadId: this.terminalWorker.threadId,
      } : null,
      pendingTasks: this.pendingTasks.size,
      queuedTasks: this.taskQueue.length,
      restartCount: this.restartCount,
    };
  }
}

// Singleton instance
let instance = null;

function getProcessManager() {
  if (!instance) {
    instance = new ProcessManager();
  }
  return instance;
}

module.exports = {
  ProcessManager,
  getProcessManager,
};
