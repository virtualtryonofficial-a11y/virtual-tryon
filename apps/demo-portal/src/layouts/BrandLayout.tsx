import type { BrandConfig } from '../types';

interface BrandLayoutProps {
  brand: BrandConfig;
  children: React.ReactNode;
}

export const BrandLayout: React.FC<BrandLayoutProps> = ({ brand, children }) => {
  const primaryColor = brand.theme.primaryColor;
  
  // Dynamic assets from configuration
  const logoUrl = brand.logoUrl;
  const bannerUrl = brand.bannerUrl;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0A0B10',
      color: '#E5E7EB',
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      // Set CSS Custom Properties for Brand styling dynamic overrides
      WebkitFontSmoothing: 'antialiased',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Brand Header */}
      <header style={{
        backgroundColor: '#0E0F17',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '16px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 90,
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Brand Logo & Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img
              src={logoUrl}
              alt={`${brand.name} Logo`}
              style={{
                height: '32px',
                objectFit: 'contain',
              }}
              onError={(e) => {
                // Fallback text if logo.svg fails or doesn't exist
                e.currentTarget.style.display = 'none';
              }}
            />
            <span style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '-0.01em',
            }}>{brand.name}</span>
          </div>
        </div>
      </header>

      {/* Brand Hero Banner */}
      <section style={{
        width: '100%',
        position: 'relative',
        height: '420px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
      }}>
        {/* Banner image background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${bannerUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          zIndex: 1,
        }} />
        
        {/* Dark radial/linear gradient overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to right, rgba(10,11,16,0.95) 30%, rgba(10,11,16,0.6) 70%, rgba(10,11,16,0.4) 100%)',
          zIndex: 2,
        }} />

        {/* Hero Content */}
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          padding: '0 24px',
          position: 'relative',
          zIndex: 3,
        }}>
          <div style={{ maxWidth: '600px' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: primaryColor,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              display: 'inline-block',
              marginBottom: '12px',
            }}>
              Partner Sandbox
            </span>
            <h1 style={{
              fontSize: '36px',
              fontWeight: 800,
              color: '#FFFFFF',
              margin: '0 0 16px 0',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
            }}>
              {brand.welcomeTitle}
            </h1>
            <p style={{
              fontSize: '16px',
              color: '#9CA3AF',
              margin: 0,
              lineHeight: 1.6,
            }}>
              {brand.description}
            </p>
          </div>
        </div>
      </section>

      {/* Main product listings */}
      <main style={{
        flex: 1,
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
        padding: '60px 24px',
      }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        backgroundColor: '#07080E',
        borderTop: '1px solid rgba(255, 255, 255, 0.04)',
        padding: '32px 24px',
        textAlign: 'center',
        fontSize: '12px',
        color: '#6B7280',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ margin: '0 0 8px 0' }}>
            Powered by <strong>Virtual-Trail AI Virtual Fitting Room</strong>
          </p>
          <p style={{ margin: 0 }}>
            &copy; {new Date().getFullYear()} MomzCradle. All rights reserved. Confidential Client Demo Environment.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default BrandLayout;
