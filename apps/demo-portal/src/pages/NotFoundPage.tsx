import React from 'react';
import { HelpCircle } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0A0B10',
      color: '#F3F4F6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        padding: '40px',
        textAlign: 'center',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'rgba(124, 58, 237, 0.12)',
          border: '1px solid rgba(124, 58, 237, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px auto'
        }}>
          <HelpCircle style={{ width: '28px', height: '28px', color: '#A78BFA' }} />
        </div>
        
        <h1 style={{
          fontSize: '24px',
          fontWeight: 800,
          background: 'linear-gradient(135deg, #FF5A5F 0%, #7C3AED 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: '0 0 16px 0',
          letterSpacing: '-0.02em'
        }}>
          Page Not Found
        </h1>
        
        <p style={{
          fontSize: '14px',
          color: '#9CA3AF',
          lineHeight: 1.6,
          margin: '0'
        }}>
          The page or brand demo you requested does not exist or has not been onboarded yet. If you are a brand partner, please check your private sandbox URL or contact support.
        </p>
      </div>
    </div>
  );
};

export default NotFoundPage;
