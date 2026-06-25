import sharp from 'sharp';
import axios from 'axios';
import fs from 'fs';
import { getSignedReadUrl } from '@trail/storage';

export interface WatermarkConfig {
  type?: 'corner-logo' | 'pattern-text' | 'pattern-logo' | 'hybrid' | string;
  keyOrUrl?: string | null;
  text?: string | null;
  scale?: number;
  position?: string;
  opacity?: number;
  rotation?: number;
  spacing?: number;
  tenantId?: string;
}

export interface WatermarkMetrics {
  watermarkType: string;
  durationMs: number;
  svgCacheHit: boolean;
  watermarkApplied: boolean;
  fallbackUsed: boolean;
}

// In-memory cache for watermark buffers and SVG patterns
const watermarkBufferCache = new Map<string, { buffer: Buffer; fetchedAt: number }>();
const svgPatternCache = new Map<string, Buffer>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

async function fetchWatermarkBuffer(keyOrUrl: string): Promise<Buffer> {
  const now = Date.now();
  const cached = watermarkBufferCache.get(keyOrUrl);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.buffer;
  }

  let buffer: Buffer;
  if (fs.existsSync(keyOrUrl)) {
    buffer = fs.readFileSync(keyOrUrl);
  } else if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    const res = await axios.get(keyOrUrl, { responseType: 'arraybuffer' });
    buffer = Buffer.from(res.data);
  } else if (keyOrUrl.startsWith('data:')) {
    const base64Data = keyOrUrl.split(',')[1] || keyOrUrl;
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    const signedUrl = await getSignedReadUrl(keyOrUrl);
    const res = await axios.get(signedUrl, { responseType: 'arraybuffer' });
    buffer = Buffer.from(res.data);
  }

  watermarkBufferCache.set(keyOrUrl, { buffer, fetchedAt: now });
  return buffer;
}

interface WatermarkStrategy {
  execute(
    mainBuffer: Buffer,
    mainImg: sharp.Sharp,
    mainMeta: sharp.Metadata,
    config: WatermarkConfig
  ): Promise<{ buffer: Buffer; metrics: Partial<WatermarkMetrics> }>;
}

class CornerLogoStrategy implements WatermarkStrategy {
  async execute(mainBuffer: Buffer, mainImg: sharp.Sharp, mainMeta: sharp.Metadata, config: WatermarkConfig) {
    if (!config || !config.keyOrUrl) {
      return { buffer: mainBuffer, metrics: { watermarkApplied: false, fallbackUsed: true } };
    }

    const watermarkRaw = await fetchWatermarkBuffer(config.keyOrUrl);
    const mainWidth = mainMeta.width || 1024;

    // Dynamic sizing with clamping: default 21% of image width, clamped between 120px and 220px
    const scale = config.scale && config.scale > 0 && config.scale <= 1 ? config.scale : 0.21;
    const rawTargetWidth = Math.round(mainWidth * scale);
    const targetWidth = Math.min(mainWidth, Math.max(120, Math.min(220, rawTargetWidth)));

    // Opacity (default 85%)
    const opacity = config.opacity && config.opacity >= 0 && config.opacity <= 1 ? config.opacity : 0.85;

    let watermarkPipeline = sharp(watermarkRaw)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .ensureAlpha();

    if (opacity < 1) {
      watermarkPipeline = watermarkPipeline.linear([1, 1, 1, opacity], [0, 0, 0, 0]);
    }

    const watermarkResizedBuf = await watermarkPipeline.toBuffer();

    const pos = config.position || 'bottom-right';
    let gravity: string = 'southeast';
    let extendOpts = { top: 0, bottom: 28, left: 0, right: 24, background: { r: 0, g: 0, b: 0, alpha: 0 } };

    if (pos === 'bottom-left') {
      gravity = 'southwest';
      extendOpts = { top: 0, bottom: 28, left: 24, right: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } };
    } else if (pos === 'bottom-center') {
      gravity = 'south';
      extendOpts = { top: 0, bottom: 28, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } };
    }

    const paddedWatermarkBuf = await sharp(watermarkResizedBuf)
      .extend(extendOpts)
      .toBuffer();

    const compositedBuffer = await mainImg
      .composite([{ input: paddedWatermarkBuf, gravity: gravity as any }])
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      buffer: compositedBuffer,
      metrics: {
        svgCacheHit: false,
        watermarkApplied: true,
        fallbackUsed: false,
      }
    };
  }
}

class PatternTextStrategy implements WatermarkStrategy {
  async execute(mainBuffer: Buffer, mainImg: sharp.Sharp, mainMeta: sharp.Metadata, config: WatermarkConfig) {
    const mainWidth = mainMeta.width || 1024;
    const mainHeight = mainMeta.height || 1024;

    // Structured Validation & Clamping
    const rawOpacity = config.opacity ?? 0.10;
    const opacity = Math.min(0.30, Math.max(0.02, rawOpacity));

    const rawSpacing = config.spacing ?? 345;
    const spacing = Math.min(650, Math.max(150, rawSpacing));

    const rawRotation = config.rotation ?? -30;
    const rotation = Math.min(90, Math.max(-90, rawRotation));

    const rawText = config.text || 'MomzCradle';
    const escapedText = escapeXml(rawText);

    // Font size (+15% larger): minimum 20px
    const fontSize = Math.max(20, Math.round(mainWidth * 0.037));

    // Adaptive Watermark Color (Pink Theme):
    // Dark images → light pink
    // Light images → darker pink
    let textColor = `rgba(255, 182, 193, ${opacity})`;
    try {
      const stats = await mainImg.stats();
      const rMean = stats.channels[0]?.mean ?? 128;
      const gMean = stats.channels[1]?.mean ?? 128;
      const bMean = stats.channels[2]?.mean ?? 128;
      const luminance = 0.299 * rMean + 0.587 * gMean + 0.114 * bMean;
      if (luminance > 135) {
        textColor = `rgba(180, 50, 90, ${opacity})`;
      }
    } catch (e) {
      // Fallback to default light pink
    }

    // Cache pre-rasterized PNG overlay per unique configuration
    const cacheKey = `${config.tenantId || 'anon'}_${escapedText}_${rotation}_${spacing}_${opacity}_${textColor}_${mainWidth}x${mainHeight}`;
    let overlayBuffer = svgPatternCache.get(cacheKey);
    let svgCacheHit = false;

    if (overlayBuffer) {
      svgCacheHit = true;
    } else {
      const svgString = `<svg width="${mainWidth}" height="${mainHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="wm" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse" patternTransform="rotate(${rotation})">
      <text x="50%" y="50%" font-family="Inter, system-ui, Arial, sans-serif" font-size="${fontSize}px" font-weight="bold" fill="${textColor}" dominant-baseline="middle" text-anchor="middle">${escapedText}</text>
    </pattern>
    <radialGradient id="face-fade" cx="50%" cy="30%" r="32%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.25)" />
      <stop offset="100%" stop-color="white" />
    </radialGradient>
    <mask id="face-mask">
      <rect width="100%" height="100%" fill="url(#face-fade)" />
    </mask>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)" mask="url(#face-mask)" />
</svg>`;
      overlayBuffer = await sharp(Buffer.from(svgString)).png().toBuffer();
      svgPatternCache.set(cacheKey, overlayBuffer);
    }

    const compositedBuffer = await mainImg
      .composite([{ input: overlayBuffer, blend: 'over' }])
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      buffer: compositedBuffer,
      metrics: {
        svgCacheHit,
        watermarkApplied: true,
        fallbackUsed: false,
      }
    };
  }
}

class PatternLogoStrategy implements WatermarkStrategy {
  async execute(mainBuffer: Buffer) {
    return { buffer: mainBuffer, metrics: { watermarkApplied: false, fallbackUsed: true } };
  }
}

class HybridStrategy implements WatermarkStrategy {
  async execute(mainBuffer: Buffer) {
    return { buffer: mainBuffer, metrics: { watermarkApplied: false, fallbackUsed: true } };
  }
}

/**
 * Applies client watermark with full runtime telemetry metrics.
 */
export async function applyWatermarkWithMetrics(
  mainImageBuffer: Buffer,
  config?: WatermarkConfig | null
): Promise<{ buffer: Buffer; metrics: WatermarkMetrics }> {
  const start = Date.now();
  const defaultType = 'corner-logo';
  const type = config?.type || defaultType;

  const baseMetrics: WatermarkMetrics = {
    watermarkType: type,
    durationMs: 0,
    svgCacheHit: false,
    watermarkApplied: false,
    fallbackUsed: false,
  };

  if (!config) {
    return { buffer: mainImageBuffer, metrics: { ...baseMetrics, fallbackUsed: true } };
  }

  try {
    const mainImg = sharp(mainImageBuffer);
    const mainMeta = await mainImg.metadata();

    let strategy: WatermarkStrategy;
    switch (type) {
      case 'pattern-text':
        strategy = new PatternTextStrategy();
        break;
      case 'pattern-logo':
        strategy = new PatternLogoStrategy();
        break;
      case 'hybrid':
        strategy = new HybridStrategy();
        break;
      case 'corner-logo':
      default:
        strategy = new CornerLogoStrategy();
        break;
    }

    const result = await strategy.execute(mainImageBuffer, mainImg, mainMeta, config);
    const durationMs = Date.now() - start;

    return {
      buffer: result.buffer,
      metrics: {
        ...baseMetrics,
        ...result.metrics,
        durationMs,
      }
    };
  } catch (err: any) {
    console.warn(`[Watermark Error]: Failed to apply watermark strategy (${type}). Proceeding unwatermarked. Error: ${err.message}`);
    return {
      buffer: mainImageBuffer,
      metrics: {
        ...baseMetrics,
        durationMs: Date.now() - start,
        fallbackUsed: true,
      }
    };
  }
}

/**
 * Backward-compatible signature returning Promise<Buffer>
 */
export async function applyWatermark(
  mainImageBuffer: Buffer,
  config?: WatermarkConfig | null
): Promise<Buffer> {
  const { buffer } = await applyWatermarkWithMetrics(mainImageBuffer, config);
  return buffer;
}
