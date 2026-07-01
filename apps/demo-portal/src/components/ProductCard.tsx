import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { BrandConfig, ProductConfig } from '../types';
import { launchTryOn } from '../services/widgetLoader';

interface ProductCardProps {
  product: ProductConfig;
  brand: BrandConfig;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, brand }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  // Resolve product image path dynamically from configuration
  const productImageUrl = product.imageUrl;

  const handleTryOn = (e: React.MouseEvent) => {
    e.stopPropagation();
    launchTryOn(brand, product).catch(err => {
      alert(`Could not launch Try-On: ${err.message}`);
    });
  };

  const primaryColor = brand.theme.primaryColor;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderRadius: '16px',
        backgroundColor: '#11121A',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s ease',
        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        borderColor: isHovered ? 'rgba(255,255,255,0.1)' : 'rgba(255, 255, 255, 0.05)'
      }}
    >
      {/* Product Image Container */}
      <div style={{
        aspectRatio: '1',
        width: '100%',
        backgroundColor: '#1E1F29',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <img
          src={productImageUrl}
          alt={product.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'transform 0.5s ease',
            transform: isHovered ? 'scale(1.05)' : 'scale(1)'
          }}
        />

        {/* Hover Overlay with Action Button */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(10, 11, 16, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.25s ease',
          pointerEvents: isHovered ? 'auto' : 'none'
        }}>
          <button
            onClick={handleTryOn}
            style={{
              padding: '12px 24px',
              borderRadius: '9999px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: `linear-gradient(135deg, ${primaryColor} 0%, #7C3AED 100%)`,
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: `0 8px 24px ${primaryColor}40`,
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = `0 10px 28px ${primaryColor}60`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = `0 8px 24px ${primaryColor}40`;
            }}
          >
            <Sparkles style={{ width: '15px', height: '15px' }} />
            <span>Try On AI</span>
          </button>
        </div>
      </div>

      {/* Info details */}
      <div style={{
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        flex: 1
      }}>
        <h3 style={{
          fontSize: '14px',
          fontWeight: 600,
          color: '#E5E7EB',
          margin: '0 0 6px 0',
          lineHeight: 1.4
        }}>{product.name}</h3>
        <p style={{
          fontSize: '15px',
          fontWeight: 700,
          color: '#F3F4F6',
          margin: 'auto 0 0 0'
        }}>{product.price}</p>
      </div>
    </div>
  );
};

export default ProductCard;
