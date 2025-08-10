#!/usr/bin/env node

import { spawn } from 'child_process';
import { join } from 'path';
import { platform } from 'os';
import { existsSync } from 'fs';

const isWindows = platform() === 'win32';
const pyAsrDir = join(process.cwd(), 'py_asr_service');
const venvDir = join(pyAsrDir, 'venv');

console.log('🚀 Starting services...');

// Check if Python environment is set up
if (!existsSync(venvDir)) {
    console.log('⚠️  Python environment not found. Setting up...');
    const { execSync } = await import('child_process');
    try {
        execSync('node scripts/setup-python.js', { stdio: 'inherit' });
    } catch (error) {
        console.error('❌ Failed to setup Python environment');
        process.exit(1);
    }
}

// Start Python server
console.log('🐍 Starting Python ASR server...');

let pythonProcess;
if (isWindows) {
    // Windows: Use Python executable directly from venv
    const pythonExe = join(venvDir, 'Scripts', 'python.exe');
    pythonProcess = spawn(pythonExe, [
        '-m', 'uvicorn', 'server:app', 
        '--host', '0.0.0.0', 
        '--port', '5686'
    ], {
        cwd: pyAsrDir,
        stdio: ['inherit', 'pipe', 'pipe']
    });
} else {
    // Unix/Linux/macOS: Use Python executable directly from venv
    const pythonExe = join(venvDir, 'bin', 'python');
    pythonProcess = spawn(pythonExe, [
        '-m', 'uvicorn', 'server:app', 
        '--host', '0.0.0.0', 
        '--port', '5686'
    ], {
        cwd: pyAsrDir,
        stdio: ['inherit', 'pipe', 'pipe']
    });
}

pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python] ${data.toString().trim()}`);
});

pythonProcess.stderr.on('data', (data) => {
    console.log(`[Python] ${data.toString().trim()}`);
});

// Wait for Python server to be ready
let pythonReady = false;
const checkPythonReady = () => {
    return new Promise((resolve) => {
        const check = async () => {
            try {
                const response = await fetch('http://localhost:5686/healthz');
                if (response.ok) {
                    pythonReady = true;
                    console.log('✅ Python ASR server is ready');
                    resolve(true);
                }
            } catch {
                setTimeout(check, 1000);
            }
        };
        check();
    });
};

// Start Node.js server after Python is ready
checkPythonReady().then(() => {
    console.log('🟢 Starting Node.js server...');
    const nodeArgs = process.argv.slice(2);
    
    let nodeProcess;
    if (nodeArgs.length > 0) {
        // Use provided arguments
        nodeProcess = spawn(nodeArgs[0], nodeArgs.slice(1), {
            stdio: ['inherit', 'pipe', 'pipe']
        });
    } else {
        // Use npm run script instead of npx directly
        if (isWindows) {
            nodeProcess = spawn('cmd.exe', ['/c', 'npm run dev:node-only'], {
                stdio: ['inherit', 'pipe', 'pipe'],
                shell: false
            });
        } else {
            nodeProcess = spawn('npm', ['run', 'dev:node-only'], {
                stdio: ['inherit', 'pipe', 'pipe']
            });
        }
    }

    nodeProcess.stdout.on('data', (data) => {
        console.log(`[Node] ${data.toString().trim()}`);
    });

    nodeProcess.stderr.on('data', (data) => {
        console.log(`[Node] ${data.toString().trim()}`);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down services...');
        pythonProcess.kill('SIGTERM');
        nodeProcess.kill('SIGTERM');
        setTimeout(() => process.exit(0), 2000);
    });

    process.on('SIGTERM', () => {
        pythonProcess.kill('SIGTERM');
        nodeProcess.kill('SIGTERM');
        process.exit(0);
    });
});

pythonProcess.on('error', (error) => {
    console.error('❌ Python server error:', error);
    process.exit(1);
});

pythonProcess.on('exit', (code) => {
    if (code !== 0) {
        console.error(`❌ Python server exited with code ${code}`);
        process.exit(1);
    }
});