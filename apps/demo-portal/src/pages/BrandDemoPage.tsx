import React from 'react';
import { useBrandResolver } from '../hooks/useBrandResolver';
import BrandLayout from '../layouts/BrandLayout';
import BrandGrid from '../components/BrandGrid';
import DemoBanner from '../components/DemoBanner';
import NotFoundPage from './NotFoundPage';

export const BrandDemoPage: React.FC = () => {
  const { brand, loading, error } = useBrandResolver();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0A0B10',
        color: '#F3F4F6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "Inter, system-ui, -apple-system, sans-serif"
      }}>
        {/* Spinner */}
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(255, 255, 255, 0.05)',
          borderTopColor: '#A78BFA',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ marginTop: '16px', fontSize: '14px', color: '#9CA3AF' }}>Resolving Brand Sandbox...</p>
        
        {/* Inline CSS animation for spinner fallback */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}} />
      </div>
    );
  }

  // Render 404 page if brand resolution fails
  if (error || !brand) {
    return <NotFoundPage />;
  }

  return (
    <>
      <DemoBanner />
      <BrandLayout brand={brand}>
        <BrandGrid brand={brand} />
      </BrandLayout>
    </>
  );
};

export default BrandDemoPage;
