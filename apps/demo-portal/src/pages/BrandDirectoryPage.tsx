import React from 'react';
import { Shirt, Sparkles, ChevronRight } from 'lucide-react';

interface BrandCard {
  id: string;
  name: string;
  desc: string;
  color: string;
  theme: 'dark' | 'light' | 'glassmorphism';
}

export const BrandDirectoryPage: React.FC = () => {
  const brands: BrandCard[] = [
    {
      id: 'effilo',
      name: 'Effilo',
      desc: 'Premium fashion & apparel showcase sandbox.',
      color: '#0f5132',
      theme: 'dark'
    },
    {
      id: 'onhete',
      name: 'Onhete',
      desc: 'Modern designer clothing collections sandbox.',
      color: '#4f46e5',
      theme: 'light'
    },
    {
      id: 'october',
      name: 'October',
      desc: 'Burnt terracotta styled outfits sandbox.',
      color: '#c2410c',
      theme: 'glassmorphism'
    },
    {
      id: 'lyvn',
      name: 'LYVN',
      desc: 'Minimalist contemporary luxury wear sandbox.',
      color: '#27272a',
      theme: 'dark'
    },
    {
      id: 'nappa-dori',
      name: 'Nappa Dori',
      desc: 'Rich leather goods & premium accessories sandbox.',
      color: '#854d0e',
      theme: 'dark'
    },
    {
      id: 'farak',
      name: 'Farak',
      desc: 'Artisanal handcrafted luxury wear sandbox.',
      color: '#9a3412',
      theme: 'dark'
    }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0A0B10',
      color: '#E5E7EB',
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Dynamic background glow */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '20%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(124, 58, 237, 0.1) 0%, rgba(0,0,0,0) 70%)',
        filter: 'blur(80px)',
        zIndex: 0,
        pointerEvents: 'none'
      }} />

      <div style={{
        maxWidth: '900px',
        width: '100%',
        zIndex: 1,
        textAlign: 'center'
      }}>
        {/* Header Monogram */}
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #7C3AED 0%, #C084FC 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px auto',
          boxShadow: '0 8px 30px rgba(124, 58, 237, 0.3)'
        }}>
          <Shirt style={{ width: '24px', height: '24px', color: '#FFFFFF' }} />
        </div>

        <h1 style={{
          fontSize: '38px',
          fontWeight: 800,
          color: '#FFFFFF',
          margin: '0 0 12px 0',
          letterSpacing: '-0.03em',
          lineHeight: 1.2
        }}>
          AI Virtual Try-On Sandbox
        </h1>
        <p style={{
          fontSize: '16px',
          color: '#9CA3AF',
          maxWidth: '540px',
          margin: '0 auto 48px auto',
          lineHeight: 1.6
        }}>
          Welcome to the client demonstration portal. Please choose one of the brands below to preview their interactive AI fitting room sandbox.
        </p>

        {/* Brand Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '24px',
          margin: '0 auto'
        }}>
          {brands.map((b) => (
            <a
              key={b.id}
              href={`/${b.id}`}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '20px',
                padding: '28px 24px',
                textDecoration: 'none',
                color: '#FFFFFF',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                height: '210px',
                boxShadow: '0 4px 30px rgba(0,0,0,0.2)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
              }}
            >
              {/* Colored Indicator */}
              <div style={{
                width: '32px',
                height: '6px',
                borderRadius: '3px',
                backgroundColor: b.color,
                marginBottom: '20px'
              }} />

              <h2 style={{
                fontSize: '20px',
                fontWeight: 700,
                margin: '0 0 8px 0',
                color: '#FFFFFF'
              }}>{b.name}</h2>
              
              <p style={{
                fontSize: '13px',
                color: '#9CA3AF',
                margin: '0 0 auto 0',
                lineHeight: 1.5
              }}>{b.desc}</p>

              {/* Bottom bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#A78BFA',
                marginTop: '16px'
              }}>
                <Sparkles style={{ width: '13px', height: '13px' }} />
                <span>Enter Showcase</span>
                <ChevronRight style={{ width: '13px', height: '13px', marginLeft: 'auto' }} />
              </div>
            </a>
          ))}
        </div>
      </div>

      <footer style={{
        marginTop: '80px',
        fontSize: '12px',
        color: '#4B5563',
        textAlign: 'center',
        zIndex: 1
      }}>
        Powered by Virtual-Trail AI • Confidential Client Sandboxes
      </footer>
    </div>
  );
};

export default BrandDirectoryPage;
