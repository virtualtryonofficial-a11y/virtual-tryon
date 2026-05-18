/**
 * Performs client-side image resizing and quality compression using a browser Canvas.
 * Limits standard selfie uploads to fit within a 1024x1024 bounding box.
 * Compresses the image as an optimized JPEG at 0.85 quality, reducing size by up to 95%.
 */
export async function resizeImageBeforeUpload(base64Str: string, maxDim = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!base64Str || typeof base64Str !== 'string') {
      resolve(base64Str);
      return;
    }

    // Skip processing if the payload is not a data URI base64 string
    if (!base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Keep original aspect ratio while enforcing limits
      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str); // Fallback
        return;
      }

      // Draw original image into resized canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to high-performance optimized JPEG format
      const resizedBase64 = canvas.toDataURL('image/jpeg', 0.85);
      resolve(resizedBase64);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for client-side resizing'));
    };

    img.src = base64Str;
  });
}
