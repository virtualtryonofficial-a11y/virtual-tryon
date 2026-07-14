import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { Download, Sparkles, RefreshCcw, X, Loader } from 'lucide-react';

interface ResultViewProps {
  onClose: () => void;
}

const ResultView: React.FC<ResultViewProps> = ({ onClose }) => {
  const { resultImage, previewImageUrl, compliment, styleScore, reset } = useStore();
  const [imageLoaded, setImageLoaded] = React.useState(false);

  const handleDownload = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href = resultImage;
    a.download = 'tryon-result.jpg';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRetry = () => {
    reset();
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: 'var(--vt-font, Inter, system-ui, sans-serif)',
      color: '#F5F5F5',
      background: 'rgba(15,17,21,0.5)',
    }}>
      {/* Image reveal */}
      <motion.div
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0c10' }}
      >
        {/* Blurred preview placeholder (visible during high-res download) */}
        {previewImageUrl && !imageLoaded && (
          <img
            src={previewImageUrl}
            alt="Loading preview..."
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'blur(10px) brightness(0.6)',
              opacity: 0.8,
            }}
          />
        )}

        {/* Shimmer/Refinement Loader */}
        {!imageLoaded && (
          <div style={{
            position: 'absolute',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 9999,
            background: 'rgba(15,17,21,0.7)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
          }}>
            <Loader style={{ width: 14, height: 14, animation: 'spin 1.2s linear infinite', color: '#FF5A5F' }} />
            <span>Refining details...</span>
          </div>
        )}

        {resultImage && (
          <motion.img
            src={resultImage}
            alt="Try-on result"
            onLoad={() => setImageLoaded(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: imageLoaded ? 1 : 0 }}
            transition={{ duration: 0.65, ease: 'easeInOut' }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              zIndex: 2,
            }}
          />
        )}

        {/* Style score badge */}
        {styleScore && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 280, damping: 22 }}
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 9999,
              background: 'rgba(15,17,21,0.75)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              fontSize: 12,
              fontWeight: 700,
              color: '#F5F5F5',
            }}
          >
            <div style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #FFB800, #FF5A5F)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Sparkles style={{ width: 11, height: 11, color: '#fff' }} />
            </div>
            Style Score: {styleScore}/10
          </motion.div>
        )}

        {/* Gradient vignette */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 80,
          background: 'linear-gradient(to top, rgba(15,17,21,0.9) 0%, transparent 100%)',
          pointerEvents: 'none',
        }} />
      </motion.div>

      {/* Bottom panel */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{
          padding: '18px 20px calc(18px + env(safe-area-inset-bottom, 0px))',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(15,17,21,0.95)',
          flexShrink: 0,
        }}
      >
        {/* Compliment */}
        {compliment && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            style={{
              fontSize: 13,
              fontStyle: 'italic',
              fontWeight: 500,
              lineHeight: 1.65,
              color: 'rgba(245,245,245,0.75)',
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            "{compliment}"
          </motion.p>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Download */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            onClick={handleDownload}
            aria-label="Download result image"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '12px 0',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(245,245,245,0.85)',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Download style={{ width: 15, height: 15 }} />
            Download
          </motion.button>

          {/* Retry */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            onClick={handleRetry}
            aria-label="Try again"
            style={{
              width: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 0',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(245,245,245,0.6)',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            <RefreshCcw style={{ width: 15, height: 15 }} />
          </motion.button>

          {/* Close / Perfect CTA */}
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: '0 8px 28px rgba(255,90,95,0.45)' }}
            whileTap={{ scale: 0.94 }}
            onClick={onClose}
            aria-label="Close and keep look"
            style={{
              flex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '12px 0',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #FF5A5F, #7C3AED)',
              border: 'none',
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(255,90,95,0.35)',
            }}
          >
            <Sparkles style={{ width: 14, height: 14 }} />
            Perfect!
          </motion.button>
        </div>

        {/* Disclaimer */}
        <p style={{
          marginTop: 12,
          textAlign: 'center',
          fontSize: 10,
          fontStyle: 'italic',
          color: 'rgba(245,245,245,0.4)',
          lineHeight: 1.4,
        }}>
          *Note: AI-generated images may contain occasional visual imperfections.
        </p>

        {/* Powered-by footer */}
        <p style={{
          marginTop: 12,
          textAlign: 'center',
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(245,245,245,0.2)',
        }}>
          Powered by Virtual‑Trail AI
        </p>
      </motion.div>
    </div>
  );
};

export default ResultView;
