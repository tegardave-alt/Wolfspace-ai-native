const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = {
  name: 'debug-opencode',
  version: '1.0.0',
  description: 'Debug OpenCode CLI issues - check logs, config, environment, and headers',
  
  run: async (args = {}) => {
    const action = args.action || 'full';
    const results = {};
    
    try {
      // Check OpenCode version
      if (action === 'full' || action === 'version') {
        try {
          results.version = execSync('opencode --version', { encoding: 'utf8' }).trim();
        } catch (e) {
          results.version = 'Not installed or not in PATH';
        }
      }
      
      // Check config files
      if (action === 'full' || action === 'config') {
        const configPaths = [
          'C:\\Users\\dave\\.config\\opencode\\config.json',
          'C:\\Users\\dave\\quantum\\opencode.json',
          'C:\\Users\\dave\\.opencode\\config.json'
        ];
        
        results.configs = {};
        for (const p of configPaths) {
          if (fs.existsSync(p)) {
            try {
              results.configs[p] = JSON.parse(fs.readFileSync(p, 'utf8'));
            } catch (e) {
              results.configs[p] = `Invalid JSON: ${e.message}`;
            }
          } else {
            results.configs[p] = 'Not found';
          }
        }
      }
      
      // Check environment variables
      if (action === 'full' || action === 'env') {
        results.env = {
          OPENCODE_PROJECT: process.env.OPENCODE_PROJECT || 'Not set',
          OPENCODE_CONFIG: process.env.OPENCODE_CONFIG || 'Not set',
          OPENCODE_HOME: process.env.OPENCODE_HOME || 'Not set',
          HOME: process.env.HOME || process.env.USERPROFILE || 'Not set',
          PATH: process.env.PATH ? 'Set' : 'Not set'
        };
      }
      
      // Check database files
      if (action === 'full' || action === 'database') {
        const dbDir = 'C:\\Users\\dave\\.local\\share\\opencode';
        results.database = {};
        
        if (fs.existsSync(dbDir)) {
          const files = fs.readdirSync(dbDir);
          for (const file of files) {
            const filePath = path.join(dbDir, file);
            const stats = fs.statSync(filePath);
            results.database[file] = {
              size: stats.size,
              modified: stats.mtime.toISOString()
            };
          }
        } else {
          results.database = 'Directory not found';
        }
      }
      
      // Check snapshot directory
      if (action === 'full' || action === 'snapshot') {
        const snapshotDir = 'C:\\Users\\dave\\.local\\share\\opencode\\snapshot';
        results.snapshot = {};
        
        if (fs.existsSync(snapshotDir)) {
          const files = fs.readdirSync(snapshotDir);
          results.snapshot.count = files.length;
          results.snapshot.files = files.slice(0, 10); // First 10 files
        } else {
          results.snapshot = 'Directory not found';
        }
      }
      
      // Check logs
      if (action === 'full' || action === 'logs') {
        const logDir = 'C:\\Users\\dave\\.local\\share\\opencode\\logs';
        results.logs = {};
        
        if (fs.existsSync(logDir)) {
          const files = fs.readdirSync(logDir).sort().reverse();
          results.logs.count = files.length;
          
          // Read latest log
          if (files.length > 0) {
            const latestLog = path.join(logDir, files[0]);
            const content = fs.readFileSync(latestLog, 'utf8');
            const lines = content.split('\n').slice(-50); // Last 50 lines
            results.logs.latest = {
              file: files[0],
              lastLines: lines.join('\n')
            };
          }
        } else {
          results.logs = 'Directory not found';
        }
      }
      
      // Check project directory
      if (action === 'full' || action === 'project') {
        const projectDir = 'C:\\Users\\dave\\quantum';
        results.project = {};
        
        if (fs.existsSync(projectDir)) {
          results.project.exists = true;
          results.project.path = projectDir;
          
          // Check for .git
          results.project.hasGit = fs.existsSync(path.join(projectDir, '.git'));
          
          // Check for package.json
          const pkgPath = path.join(projectDir, 'package.json');
          if (fs.existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
              results.project.packageName = pkg.name;
              results.project.packageVersion = pkg.version;
            } catch (e) {
              results.project.packageJson = 'Invalid';
            }
          }
        } else {
          results.project.exists = false;
        }
      }
      
      // Analyze header issue
      if (action === 'full' || action === 'header') {
        results.headerAnalysis = {
          issue: "Header 'x-opencode-project' has invalid value",
          possibleCauses: [
            "Project ID contains invalid characters (spaces, null bytes, special chars)",
            "Project ID is empty or undefined",
            "Config file has malformed project identifier",
            "Database corruption causing invalid project reference"
          ],
          recommendations: [
            "Check if OPENCODE_PROJECT env var is set correctly",
            "Verify project directory name has no special characters",
            "Ensure config files don't have 'project' key (removed in recent versions)",
            "Try running OpenCode from a different directory"
          ]
        };
      }
      
      return {
        success: true,
        action: action,
        timestamp: new Date().toISOString(),
        results: results
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  }
};
