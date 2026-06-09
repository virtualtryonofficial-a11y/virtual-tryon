import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useStore } from '../store/useStore';
import { Camera, Upload, X } from 'lucide-react';
import UploadTab from './UploadTab';
import CameraTab from './CameraTab';
import ProcessingView from './ProcessingView';
import ResultView from './ResultView';
import ErrorToast from './ErrorToast';

interface ModalProps {
  onClose: () => void;
  productId: string;
  tenantId: string;
}

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 640;

const Modal: React.FC<ModalProps> = ({ onClose, productId, tenantId }) => {
  const { status, reset, error, config } = useStore();
  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>('upload');
  const [mobile, setMobile] = useState(isMobile());

  // Detect mobile on resize
  useEffect(() => {
    const handleResize = () => setMobile(isMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const primaryColor = config?.primaryColor || '#FF5A5F';

  // ── Shared styles ──────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(15,17,21,0.96)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.09)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
    overflow: 'hidden',
    fontFamily: 'var(--vt-font, Inter, system-ui, sans-serif)',
    color: '#F5F5F5',
    WebkitFontSmoothing: 'antialiased',
    ...(mobile
      ? {
          width: '100vw',
          height: '100dvh',
          maxWidth: '100vw',
          borderRadius: 0,
        }
      : {
          width: 'min(460px, 90vw)',
          height: 'min(640px, 88vh)',
          borderRadius: 24,
        }),
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: mobile ? 'flex-end' : 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  };

  // ── Motion variants ────────────────────────────────────────────
  const cardVariants: Variants = mobile
    ? {
        hidden:  { y: '100%', opacity: 0 },
        visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 280, damping: 28 } },
        exit:    { y: '100%', opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } },
      }
    : {
        hidden:  { opacity: 0, scale: 0.93, y: 20 },
        visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 30 } },
        exit:    { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.18, ease: 'easeIn' } },
      };

  // ── Tab bar ────────────────────────────────────────────────────
  const TabBar = () => (
    <div style={{
      display: 'flex',
      position: 'relative',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      {(['upload', 'camera'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          aria-label={tab === 'upload' ? 'Upload tab' : 'Camera tab'}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '15px 0',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.01em',
            fontFamily: 'inherit',
            color: activeTab === tab ? '#F5F5F5' : 'rgba(245,245,245,0.38)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'color 0.2s',
          }}
        >
          {tab === 'upload'
            ? <Upload style={{ width: 15, height: 15 }} />
            : <Camera style={{ width: 15, height: 15 }} />
          }
          {tab === 'upload' ? 'Upload' : 'Camera'}
        </button>
      ))}
      {/* Sliding indicator */}
      <motion.div
        animate={{ left: activeTab === 'upload' ? '0%' : '50%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: '0%',
          width: '50%',
          height: 2,
          background: `linear-gradient(90deg, ${primaryColor}, #7C3AED)`,
          borderRadius: '2px 2px 0 0',
          boxShadow: `0 -2px 10px ${primaryColor}50`,
        }}
      />
    </div>
  );

  // ── Content router ─────────────────────────────────────────────
  const renderContent = () => {
    switch (status) {
      case 'idle':
        return (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <TabBar />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: activeTab === 'upload' ? -12 : 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: activeTab === 'upload' ? 12 : -12 }}
                  transition={{ duration: 0.2 }}
                  style={{ height: '100%' }}
                >
                  {activeTab === 'upload'
                    ? <UploadTab productId={productId} tenantId={tenantId} />
                    : <CameraTab productId={productId} tenantId={tenantId} />
                  }
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        );
      case 'uploading':
      case 'queued':
      case 'polling':
        return <ProcessingView />;
      case 'completed':
        return <ResultView onClose={handleClose} />;
      case 'failed':
      case 'timeout':
        return (
          <ErrorToast
            message={error || ''}
            onRetry={reset}
            onDismiss={handleClose}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <AnimatePresence>
        <motion.div
          key="modal-card"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={cardStyle}
          role="dialog"
          aria-modal="true"
          aria-label="Virtual Try-On"
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px 14px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
          }}>
            {config?.logoUrl ? (
              <img src={config.logoUrl} style={{ height: 26, objectFit: 'contain' }} alt="Brand Logo" />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #FF5A5F, #7C3AED)',
                  boxShadow: '0 0 6px rgba(255,90,95,0.6)',
                }} />
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(245,245,245,0.5)',
                }}>
                  Virtual Try‑On
                </span>
              </div>
            )}
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleClose}
              aria-label="Close modal"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.10)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'rgba(245,245,245,0.7)',
                transition: 'background 0.2s',
              }}
            >
              <X style={{ width: 15, height: 15 }} />
            </motion.button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={status}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ height: '100%' }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default Modal;
