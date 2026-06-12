import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import { Upload, ImageIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { startTryOn } from '../utils/api';

interface UploadTabProps {
  productId: string;
  tenantId: string;
}

const UploadTab: React.FC<UploadTabProps> = ({ productId, tenantId }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setStatus, setJobId, setUserImage, setError } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setValidationError(null);

    if (!file.type.startsWith('image/')) {
      setValidationError("This file type isn't supported. Please use a JPG, PNG, or WebP photo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setValidationError("Photo is too large. Please use an image under 5 MB for the best results.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
      setUserImage(base64);
      setStatus('uploading');
      try {
        const jobId = await startTryOn(tenantId, productId, base64);
        setJobId(jobId);
        setStatus('queued');
      } catch (err: any) {
        setError(err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{
      padding: '20px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      fontFamily: 'var(--vt-font, Inter, system-ui, sans-serif)',
      color: '#F5F5F5',
    }}>
      {/* Drop zone */}
      <motion.div
        animate={{
          borderColor: isDragging ? '#FF5A5F' : 'rgba(255,255,255,0.12)',
          scale: isDragging ? 1.015 : 1,
          boxShadow: isDragging ? '0 0 40px rgba(255,90,95,0.2)' : 'none',
        }}
        transition={{ duration: 0.2 }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload photo area. Click or drag to upload."
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        style={{
          flex: 1,
          border: '1.5px dashed rgba(255,255,255,0.12)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          background: isDragging ? 'rgba(255,90,95,0.06)' : 'rgba(255,255,255,0.03)',
          transition: 'background 0.2s',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 200,
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="image/*"
          aria-label="Upload image file"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        <AnimatePresence mode="wait">
          {preview ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0 }}
            >
              <img
                src={preview}
                alt="Uploaded preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 15 }}
              />
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(15,17,21,0.4)',
                borderRadius: 15,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <CheckCircle2 style={{ width: 40, height: 40, color: '#FF5A5F' }} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px' }}
            >
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'rgba(255,90,95,0.10)',
                  border: '1px solid rgba(255,90,95,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Upload style={{ width: 26, height: 26, color: '#FF5A5F' }} />
              </motion.div>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#F5F5F5' }}>
                Click or drag to upload
              </p>
              <p style={{ fontSize: 12, color: 'rgba(245,245,245,0.4)' }}>
                JPG, PNG or WebP · max 5 MB
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Validation error */}
      <AnimatePresence>
        {validationError && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            style={{
              display: 'flex',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(255,90,95,0.10)',
              border: '1px solid rgba(255,90,95,0.25)',
              fontSize: 12,
              color: 'rgba(245,245,245,0.8)',
              lineHeight: 1.5,
            }}
          >
            <AlertCircle style={{ width: 15, height: 15, color: '#FF5A5F', flexShrink: 0, marginTop: 1 }} />
            {validationError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stylist tip */}
      <div style={{
        display: 'flex',
        gap: 10,
        padding: '11px 14px',
        borderRadius: 10,
        background: 'rgba(124,58,237,0.08)',
        border: '1px solid rgba(124,58,237,0.20)',
      }}>
        <ImageIcon style={{ width: 15, height: 15, color: '#7C3AED', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(245,245,245,0.55)' }}>
          <strong style={{ color: 'rgba(245,245,245,0.75)', fontWeight: 600 }}>Stylist Tip:</strong>{' '}
          For the best try-on result, upload a well-lit, full-size front-facing photo with a simple background. Do not upload close-up selfies or cropped images.
        </p>
      </div>
    </div>
  );
};

export default UploadTab;
