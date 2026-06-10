import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { Sparkles } from 'lucide-react';

interface TryOnButtonProps {
  onClick: () => void;
}

const TryOnButton: React.FC<TryOnButtonProps> = ({ onClick }) => {
  const { config } = useStore();

  if (!config?.features.includes('tryon')) return null;

  return (
    <motion.button
      onClick={onClick}
      aria-label="Open Virtual Try-On"
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
      whileHover={{ scale: 1.06, y: -2 }}
      whileTap={{ scale: 0.94 }}
      style={{
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '14px 22px',
        borderRadius: '9999px',
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'linear-gradient(135deg, #FF5A5F 0%, #7C3AED 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(255,90,95,0.35), 0 2px 8px rgba(0,0,0,0.3)',
        color: '#fff',
        fontFamily: 'var(--vt-font, Inter, system-ui, sans-serif)',
        fontSize: '14px',
        fontWeight: 600,
        letterSpacing: '0.01em',
        cursor: 'pointer',
        WebkitFontSmoothing: 'antialiased',
      }}
      className="vt-anim-pulse virtual-trail-launcher"
    >
      <motion.span
        animate={{ rotate: [0, 15, -10, 0] }}
        transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut', delay: 1 }}
        style={{ display: 'flex', alignItems: 'center' }}
      >
        <Sparkles style={{ width: 18, height: 18 }} />
      </motion.span>
      <span>Try it on</span>
    </motion.button>
  );
};

export default TryOnButton;
