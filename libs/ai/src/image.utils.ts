import sharp from 'sharp';

// Enforce strict memory & thread limits for Render starter instance (max 512MB RAM OOM protection)
sharp.cache({ memory: 15, files: 2, items: 10 });
sharp.concurrency(1);

export async function compressForTryOn(inputBuffer: Buffer): Promise<Buffer> {
  const originalSize = inputBuffer.length;
  
  const compressed = await sharp(inputBuffer)
    .resize({ 
      width: 1024, 
      height: 1024, 
      fit: 'inside', 
      withoutEnlargement: true 
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  const compressedSize = compressed.length;
  const reduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
  
  console.debug(`Image compressed: ${originalSize} -> ${compressedSize} bytes (${reduction}% reduction)`);
  
  return compressed;
}

export function validateUserImage(buffer: Buffer): void {
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Image must be under 5MB');
  }

  const isJpg = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
  const isWebp = buffer.slice(8, 12).toString() === 'WEBP';

  if (!isJpg && !isPng && !isWebp) {
    throw new Error('Image must be JPG, PNG, or WebP');
  }
}
