import fs from 'fs';
import path from 'path';
import sharp from '../../libs/ai/node_modules/sharp/lib/index.js';
import { applyWatermarkWithMetrics } from '../../libs/ai/src/watermark.js';
import { compressForTryOn, blurImage } from '../../libs/ai/src/image.utils.js';
import { sharpLock } from '../../libs/ai/src/sharp.lock.js';

sharp.cache({ memory: 15, files: 2, items: 10 });
sharp.concurrency(1);

function getMemoryMB() {
  const m = process.memoryUsage();
  return {
    rss: Math.round((m.rss / 1024 / 1024) * 100) / 100,
    heapTotal: Math.round((m.heapTotal / 1024 / 1024) * 100) / 100,
    heapUsed: Math.round((m.heapUsed / 1024 / 1024) * 100) / 100,
    external: Math.round((m.external / 1024 / 1024) * 100) / 100,
    arrayBuffers: Math.round((m.arrayBuffers / 1024 / 1024) * 100) / 100,
  };
}

async function runScenario(name: string, concurrency: number, task: (i: number) => Promise<any>) {
  global.gc && global.gc();
  const startMem = getMemoryMB();
  console.log(`\n--- Scenario: ${name} (Concurrency: ${concurrency}) ---`);
  console.log('Baseline:', startMem);

  let peakRss = 0;
  let peakExternal = 0;
  const interval = setInterval(() => {
    const mem = getMemoryMB();
    if (mem.rss > peakRss) peakRss = mem.rss;
    if (mem.external > peakExternal) peakExternal = mem.external;
  }, 5);

  const promises = [];
  let successes = 0;
  for (let i = 0; i < concurrency; i++) {
    promises.push(
      task(i)
        .then(() => { successes++; })
        .catch((err) => { console.error(`Task ${i} failed:`, err.message); })
    );
  }

  await Promise.all(promises);
  clearInterval(interval);
  
  global.gc && global.gc();
  // Wait a bit to let GC settle
  await new Promise(res => setTimeout(res, 500));
  global.gc && global.gc();
  const endMem = getMemoryMB();

  console.log(`Peak RSS: ${peakRss} MB, Peak External: ${peakExternal} MB`);
  console.log(`Final Memory:`, endMem);
  console.log(`Successes: ${successes}/${concurrency}`);
  return { peakRss, peakExternal, startMem, endMem, successes };
}

async function generateLargeImage(width: number, height: number): Promise<Buffer> {
  return await sharp({
    create: { width, height, channels: 3, background: { r: Math.random()*255, g: 100, b: 100 } }
  }).jpeg().toBuffer();
}

async function main() {
  console.log('Generating realistic large images (4K)...');
  const largeJpg = await generateLargeImage(3840, 2160);
  console.log(`4K Image size: ${(largeJpg.length / 1024 / 1024).toFixed(2)} MB`);
  
  // Create a watermark pattern logo to pass to watermark logic
  fs.writeFileSync('MomzCradle_Water_mark.png', await sharp({
    create: { width: 500, height: 500, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } }
  }).png().toBuffer());

  const compressTask = async () => compressForTryOn(largeJpg);
  const watermarkTask = async () => applyWatermarkWithMetrics(largeJpg, { type: 'pattern-logo', keyOrUrl: 'MomzCradle_Water_mark.png', tenantId: 'tenant1' });
  const blurTask = async () => blurImage(largeJpg, 25, 60);
  
  const unprotectedMetadataStatsTask = async () => {
    const img = sharp(largeJpg);
    const meta = await img.metadata();
    const stats = await img.stats();
    return { meta, stats };
  };

  const mixedWorkloadTask = async (i: number) => {
    // Simulates API (compress) + worker (watermark) interleaved
    if (i % 3 === 0) {
      return watermarkTask();
    } else if (i % 3 === 1) {
      return blurTask();
    } else {
      return compressTask();
    }
  };

  const scenarios = [1, 3, 5, 20];

  console.log('\n=========================================');
  console.log('1. COMPRESS (API UPLOAD) WITH LOCK');
  for (const c of scenarios) await runScenario(`compressForTryOn`, c, compressTask);

  console.log('\n=========================================');
  console.log('2. WATERMARK (WORKER) WITH LOCK');
  for (const c of scenarios) await runScenario(`applyWatermark`, c, watermarkTask);

  console.log('\n=========================================');
  console.log('3. UNPROTECTED METADATA + STATS (NO LOCK)');
  for (const c of scenarios) await runScenario(`metadata+stats (Unprotected)`, c, unprotectedMetadataStatsTask);

  console.log('\n=========================================');
  console.log('4. MIXED REALISTIC WORKLOAD (API + WORKER) WITH LOCK');
  for (const c of scenarios) await runScenario(`Mixed Workload`, c, mixedWorkloadTask);
}

main().catch(console.error);
