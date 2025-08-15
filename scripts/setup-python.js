#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { platform } from 'os';

const isWindows = platform() === 'win32';
const pyAsrDir = join(process.cwd(), 'py_asr_service');
const venvDir = join(pyAsrDir, 'venv');

console.log('🐍 Setting up Python ASR service...');

// Check if Python is available
try {
    execSync('python --version', { stdio: 'ignore' });
} catch {
    try {
        execSync('python3 --version', { stdio: 'ignore' });
        // Use python3 if python is not available
        process.env.PYTHON_CMD = 'python3';
    } catch {
        console.error('❌ Python not found. Please install Python 3.8+');
        process.exit(1);
    }
}

const pythonCmd = process.env.PYTHON_CMD || 'python';

// Create virtual environment if it doesn't exist
if (!existsSync(venvDir)) {
    console.log('📦 Creating virtual environment...');
    try {
        execSync(`${pythonCmd} -m venv venv`, { 
            cwd: pyAsrDir, 
            stdio: 'inherit' 
        });
        console.log('✅ Virtual environment created');
    } catch (error) {
        console.error('❌ Failed to create virtual environment:', error.message);
        process.exit(1);
    }
}

// Install dependencies
console.log('📋 Installing Python dependencies...');
const activateCmd = isWindows 
    ? join(venvDir, 'Scripts', 'activate.bat')
    : join(venvDir, 'bin', 'activate');

const installCmd = isWindows
    ? `"${activateCmd}" && pip install -r requirements.txt`
    : `source "${activateCmd}" && pip install -r requirements.txt`;

try {
    execSync(installCmd, { 
        cwd: pyAsrDir, 
        stdio: 'inherit',
        shell: true 
    });
    console.log('✅ Python dependencies installed');
} catch (error) {
    console.error('❌ Failed to install dependencies:', error.message);
    process.exit(1);
}

console.log('🎉 Python ASR service setup complete!');