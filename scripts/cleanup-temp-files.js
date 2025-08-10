#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const audioDir = path.join(process.cwd(), 'audio_file');

console.log('🧹 Cleaning up temporary files...');

if (!fs.existsSync(audioDir)) {
    console.log('✅ No audio_file directory found');
    process.exit(0);
}

const items = fs.readdirSync(audioDir);
let cleanedCount = 0;
let totalSize = 0;

items.forEach(item => {
    const itemPath = path.join(audioDir, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory() && item.startsWith('temp_')) {
        try {
            // Calculate directory size before deletion
            const size = calculateDirSize(itemPath);
            totalSize += size;
            
            // Remove the temporary directory
            fs.rmSync(itemPath, { recursive: true, force: true });
            console.log(`🗑️  Removed: ${item} (${formatBytes(size)})`);
            cleanedCount++;
        } catch (error) {
            console.error(`❌ Failed to remove ${item}: ${error.message}`);
        }
    } else if (stat.isFile() && (item.startsWith('audio_') || item.endsWith('.m4a') || item.endsWith('.wav'))) {
        try {
            totalSize += stat.size;
            fs.unlinkSync(itemPath);
            console.log(`🗑️  Removed file: ${item} (${formatBytes(stat.size)})`);
            cleanedCount++;
        } catch (error) {
            console.error(`❌ Failed to remove ${item}: ${error.message}`);
        }
    }
});

console.log(`\n✅ Cleanup complete!`);
console.log(`📊 Removed ${cleanedCount} items`);
console.log(`💾 Freed up ${formatBytes(totalSize)} of storage`);

function calculateDirSize(dirPath) {
    let size = 0;
    const items = fs.readdirSync(dirPath);
    
    items.forEach(item => {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isFile()) {
            size += stat.size;
        } else if (stat.isDirectory()) {
            size += calculateDirSize(itemPath);
        }
    });
    
    return size;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}