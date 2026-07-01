import React from 'react';
import ProductCard from './ProductCard';
import type { BrandConfig } from '../types';

interface BrandGridProps {
  brand: BrandConfig;
}

export const BrandGrid: React.FC<BrandGridProps> = ({ brand }) => {
  return (
    <div style={{
      width: '100%',
      fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    }}>
      <h2 style={{
        fontSize: '20px',
        fontWeight: 700,
        color: '#F3F4F6',
        margin: '0 0 24px 0',
        letterSpacing: '-0.01em'
      }}>
        Featured Garments
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '24px'
      }}>
        {brand.products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            brand={brand}
          />
        ))}
      </div>
    </div>
  );
};

export default BrandGrid;
