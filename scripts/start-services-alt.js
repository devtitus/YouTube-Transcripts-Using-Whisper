#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { join } from 'path';
import { platform } from 'os';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
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
const pythonExe = isWindows 
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python');

const pythonProcess = spawn(pythonExe, [
    '-m', 'uvicorn', 'server:app', 
    '--host', '0.0.0.0', 
    '--port', '5686'
], {
    cwd: pyAsrDir,
    stdio: ['inherit', 'pipe', 'pipe']
});

pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python] ${data.toString().trim()}`);
});

pythonProcess.stderr.on('data', (data) => {
    console.log(`[Python] ${data.toString().trim()}`);
});

// Wait for Python server to be ready
const checkPythonReady = () => {
    return new Promise((resolve) => {
        const check = async () => {
            try {
                const response = await fetch('http://localhost:5686/healthz');
                if (response.ok) {
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
    
    // Try to find tsx executable
    let tsxPath;
    try {
        // First try to use the direct path to CLI
        tsxPath = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.cjs');
        if (existsSync(tsxPath)) {
            console.log(`📦 Found tsx CLI at: ${tsxPath}`);
        } else {
            throw new Error('CLI not found');
        }
    } catch {
        try {
            tsxPath = require.resolve('tsx/cli.cjs');
            console.log(`📦 Found tsx at: ${tsxPath}`);
        } catch {
            console.error('❌ tsx not found. Trying alternative approach...');
            
            // Fallback: use npm run command
            console.log('🔄 Using npm run dev:node-only as fallback');
            const nodeProcess = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev:node-only'], {
                stdio: ['inherit', 'inherit', 'inherit']
            });
            
            nodeProcess.on('error', (error) => {
                console.error('❌ Node server error:', error);
                process.exit(1);
            });
            
            nodeProcess.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`❌ Node server exited with code ${code}`);
                }
            });
            return;
        }
    }

    console.log(`🚀 Executing: node ${tsxPath} watch src/server.ts`);
    
    // Start Node.js with tsx directly
    const nodeProcess = spawn('node', [tsxPath, 'watch', 'src/server.ts'], {
        stdio: ['inherit', 'inherit', 'inherit']
    });

    // Output is handled via stdio: 'inherit'

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

    nodeProcess.on('error', (error) => {
        console.error('❌ Node server error:', error);
        process.exit(1);
    });

    nodeProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`❌ Node server exited with code ${code}`);
        }
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