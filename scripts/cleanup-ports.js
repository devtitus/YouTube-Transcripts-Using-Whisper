#!/usr/bin/env node

import { exec } from 'child_process';
import { platform } from 'os';

const isWindows = platform() === 'win32';

console.log('🧹 Cleaning up port conflicts...');

if (isWindows) {
    // Find processes using port 5688
    exec('netstat -ano | findstr :5688', (error, stdout, stderr) => {
        if (stdout) {
            console.log('Processes using port 5688:');
            console.log(stdout);

            // Extract PIDs
            const lines = stdout.split('\n').filter(line => line.trim());
            const pids = new Set();

            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0') {
                    pids.add(pid);
                }
            });

            if (pids.size > 0) {
                console.log(`Found PIDs using port 5688: ${Array.from(pids).join(', ')}`);
                console.log('\nTo kill these processes, run:');
                pids.forEach(pid => {
                    console.log(`taskkill /F /PID ${pid}`);
                });
            }
        } else {
            console.log('✅ No processes found using port 5688');
        }
    });

    // Also check for node.exe processes
    exec('tasklist /FI "IMAGENAME eq node.exe" /FO CSV', (error, stdout, stderr) => {
        if (stdout) {
            console.log('\nAll Node.js processes:');
            const lines = stdout.split('\n').filter(line => line.includes('node.exe'));
            lines.forEach(line => {
                const parts = line.split(',');
                if (parts.length >= 2) {
                    const pid = parts[1].replace(/"/g, '');
                    console.log(`PID: ${pid} - To kill: taskkill /F /PID ${pid}`);
                }
            });
        }
    });

} else {
    // Unix/Linux/macOS
    exec('lsof -i :5688', (error, stdout, stderr) => {
        if (stdout) {
            console.log('Processes using port 5688:');
            console.log(stdout);
        } else {
            console.log('✅ No processes found using port 5688');
        }
    });

    exec('ps aux | grep node', (error, stdout, stderr) => {
        if (stdout) {
            console.log('\nAll Node.js processes:');
            console.log(stdout);
        }
    });
}