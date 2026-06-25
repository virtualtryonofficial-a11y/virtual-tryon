import fs from 'fs';
import path from 'path';
import { applyWatermark } from '@trail/ai';

async function verifyWatermark() {
  console.log('--- Verifying Watermark Application ---');
  
  const sampleImagePath = path.join(__dirname, '../test-assets/good/person1.jpg');
  const watermarkPath = path.join(__dirname, '../MomzCradle_Water_mark.png');
  const outputPath = path.join(__dirname, '../test-assets/outputs/person1_watermarked.jpg');

  if (!fs.existsSync(sampleImagePath) || !fs.existsSync(watermarkPath)) {
    throw new Error('Test assets missing!');
  }

  const sampleBuffer = fs.readFileSync(sampleImagePath);

  console.log('Applying watermark...');
  const start = Date.now();
  const watermarkedBuffer = await applyWatermark(sampleBuffer, {
    keyOrUrl: watermarkPath,
    scale: 0.21,
    position: 'bottom-right',
    opacity: 0.85,
  });
  const elapsed = Date.now() - start;

  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }

  fs.writeFileSync(outputPath, watermarkedBuffer);

  console.log(`✅ Watermark successfully applied in ${elapsed}ms! Output saved to: ${outputPath}`);
  console.log(`Original size: ${sampleBuffer.length} bytes, Watermarked size: ${watermarkedBuffer.length} bytes`);
}

verifyWatermark().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
