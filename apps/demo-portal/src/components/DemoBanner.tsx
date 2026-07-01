import React from 'react';
import { ShieldAlert } from 'lucide-react';
import demoSettings from '../config/demo-settings.json';

export const DemoBanner: React.FC = () => {
  if (!demoSettings.showDemoBanner) return null;

  return (
    <div style={{
      width: '100%',
      backgroundColor: 'rgba(124, 58, 237, 0.1)',
      borderBottom: '1px solid rgba(124, 58, 237, 0.25)',
      backdropFilter: 'blur(8px)',
      color: '#A78BFA',
      fontSize: '12px',
      fontWeight: 500,
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      textAlign: 'center',
      zIndex: 1000,
      position: 'sticky',
      top: 0,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      letterSpacing: '0.01em'
    }}>
      <ShieldAlert style={{ width: '15px', height: '15px', flexShrink: 0, color: '#C084FC' }} />
      <span>{demoSettings.bannerText}</span>
    </div>
  );
};

export default DemoBanner;
