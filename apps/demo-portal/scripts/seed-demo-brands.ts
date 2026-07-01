import { prisma } from '@trail/db';
import { upload } from '@trail/storage';
import { config as appConfig } from '@trail/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname since this file runs in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local paths to placeholder assets
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const PLACEHOLDERS_DIR = path.join(PROJECT_ROOT, 'apps/demo-portal/public/assets/placeholders');
const BRAND_ASSETS_DIR = path.join(PROJECT_ROOT, 'apps/demo-portal/public/assets/brands');

interface SeedProduct {
  id: string;
  shopifyProductId: string;
  name: string;
  price: string;
  imageName: string;
}

interface SeedBrand {
  id: string;
  name: string;
  welcomeTitle: string;
  description: string;
  primaryColor: string;
  accentColor: string;
  widgetTheme: 'light' | 'dark' | 'glassmorphism';
  products: SeedProduct[];
}

const BRANDS_TO_SEED: SeedBrand[] = [
  {
    id: 'effilo',
    name: 'Effilo',
    welcomeTitle: 'Welcome to Effilo Showcase',
    description: 'Experience our latest collections with state-of-the-art AI virtual try-on.',
    primaryColor: '#0f5132',
    accentColor: '#198754',
    widgetTheme: 'dark',
    products: [
      {
        id: 'effilo-p1',
        shopifyProductId: 'shopify-prod-effilo-1',
        name: 'Product 1',
        price: '$--.--',
        imageName: 'product-1.webp'
      },
      {
        id: 'effilo-p2',
        shopifyProductId: 'shopify-prod-effilo-2',
        name: 'Product 2',
        price: '$--.--',
        imageName: 'product-2.webp'
      },
      {
        id: 'effilo-p3',
        shopifyProductId: 'shopify-prod-effilo-3',
        name: 'Product 3',
        price: '$--.--',
        imageName: 'product-3.webp'
      }
    ]
  },
  {
    id: 'onhete',
    name: 'Onhete',
    welcomeTitle: 'Welcome to Onhete Showcase',
    description: 'Experience our latest collections with state-of-the-art AI virtual try-on.',
    primaryColor: '#4f46e5',
    accentColor: '#818cf8',
    widgetTheme: 'light',
    products: [
      {
        id: 'onhete-p1',
        shopifyProductId: 'shopify-prod-onhete-1',
        name: 'Product 1',
        price: '$--.--',
        imageName: 'product-1.webp'
      },
      {
        id: 'onhete-p2',
        shopifyProductId: 'shopify-prod-onhete-2',
        name: 'Product 2',
        price: '$--.--',
        imageName: 'product-2.webp'
      },
      {
        id: 'onhete-p3',
        shopifyProductId: 'shopify-prod-onhete-3',
        name: 'Product 3',
        price: '$--.--',
        imageName: 'product-3.webp'
      }
    ]
  },
  {
    id: 'october',
    name: 'October',
    welcomeTitle: 'Welcome to October Showcase',
    description: 'Experience our latest collections with state-of-the-art AI virtual try-on.',
    primaryColor: '#c2410c',
    accentColor: '#f97316',
    widgetTheme: 'glassmorphism',
    products: [
      {
        id: 'october-p1',
        shopifyProductId: 'shopify-prod-october-1',
        name: 'Product 1',
        price: '$--.--',
        imageName: 'product-1.webp'
      },
      {
        id: 'october-p2',
        shopifyProductId: 'shopify-prod-october-2',
        name: 'Product 2',
        price: '$--.--',
        imageName: 'product-2.webp'
      },
      {
        id: 'october-p3',
        shopifyProductId: 'shopify-prod-october-3',
        name: 'Product 3',
        price: '$--.--',
        imageName: 'product-3.webp'
      }
    ]
  },
  {
    id: 'lyvn',
    name: 'LYVN',
    welcomeTitle: 'Welcome to LYVN Showcase',
    description: 'Experience our latest collections with state-of-the-art AI virtual try-on.',
    primaryColor: '#27272a',
    accentColor: '#71717a',
    widgetTheme: 'dark',
    products: [
      {
        id: 'lyvn-p1',
        shopifyProductId: 'shopify-prod-lyvn-1',
        name: 'Product 1',
        price: '$--.--',
        imageName: 'product-1.webp'
      },
      {
        id: 'lyvn-p2',
        shopifyProductId: 'shopify-prod-lyvn-2',
        name: 'Product 2',
        price: '$--.--',
        imageName: 'product-2.webp'
      },
      {
        id: 'lyvn-p3',
        shopifyProductId: 'shopify-prod-lyvn-3',
        name: 'Product 3',
        price: '$--.--',
        imageName: 'product-3.webp'
      }
    ]
  },
  {
    id: 'nappa-dori',
    name: 'Nappa Dori',
    welcomeTitle: 'Welcome to Nappa Dori Showcase',
    description: 'Experience our latest collections with state-of-the-art AI virtual try-on.',
    primaryColor: '#854d0e',
    accentColor: '#ca8a04',
    widgetTheme: 'dark',
    products: [
      {
        id: 'nappa-dori-p1',
        shopifyProductId: 'shopify-prod-nappa-dori-1',
        name: 'Product 1',
        price: '$--.--',
        imageName: 'product-1.webp'
      },
      {
        id: 'nappa-dori-p2',
        shopifyProductId: 'shopify-prod-nappa-dori-2',
        name: 'Product 2',
        price: '$--.--',
        imageName: 'product-2.webp'
      },
      {
        id: 'nappa-dori-p3',
        shopifyProductId: 'shopify-prod-nappa-dori-3',
        name: 'Product 3',
        price: '$--.--',
        imageName: 'product-3.webp'
      }
    ]
  },
  {
    id: 'farak',
    name: 'Farak',
    welcomeTitle: 'Welcome to Farak Showcase',
    description: 'Experience our latest collections with state-of-the-art AI virtual try-on.',
    primaryColor: '#9a3412',
    accentColor: '#ea580c',
    widgetTheme: 'dark',
    products: [
      {
        id: 'farak-p1',
        shopifyProductId: 'shopify-prod-farak-1',
        name: 'Product 1',
        price: '$--.--',
        imageName: 'product-1.webp'
      },
      {
        id: 'farak-p2',
        shopifyProductId: 'shopify-prod-farak-2',
        name: 'Product 2',
        price: '$--.--',
        imageName: 'product-2.webp'
      },
      {
        id: 'farak-p3',
        shopifyProductId: 'shopify-prod-farak-3',
        name: 'Product 3',
        price: '$--.--',
        imageName: 'product-3.webp'
      }
    ]
  }
];

async function seed() {
  console.log('🚀 Starting demo brands database seeding and R2 upload...');
  
  const generatedConfigs: Record<string, any> = {};

  const localProductPlaceholderPath = path.join(PLACEHOLDERS_DIR, 'product.webp');
  if (!fs.existsSync(localProductPlaceholderPath)) {
    throw new Error(`Placeholder product image does not exist at ${localProductPlaceholderPath}`);
  }

  const placeholderBuffer = fs.readFileSync(localProductPlaceholderPath);

  for (const brand of BRANDS_TO_SEED) {
    console.log(`\n📦 Processing Brand: ${brand.name}...`);

    // 1. Onboard / Upsert Tenant in PostgreSQL
    const shopifyDomain = `${brand.id}.myshopify.com`;
    let tenant = await prisma.tenant.findUnique({
      where: { id: brand.id }
    });

    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          id: brand.id,
          name: brand.name,
          shopifyDomain,
          features: ['tryon']
        }
      });
      console.log(`   Tenant created with API Key: ${tenant.apiKey}`);
    } else {
      console.log(`   Tenant already exists with API Key: ${tenant.apiKey}`);
    }

    // 2. Onboard / Upsert TenantConfig
    await prisma.tenantConfig.upsert({
      where: { tenantId: brand.id },
      update: {
        primaryColor: brand.primaryColor,
        widgetTheme: brand.widgetTheme
      },
      create: {
        tenantId: brand.id,
        primaryColor: brand.primaryColor,
        widgetTheme: brand.widgetTheme,
        complimentTone: 'friendly',
        segmindModel: 'fashion-tryon-v1'
      }
    });
    console.log(`   TenantConfig upserted.`);

    const brandConfigJson = {
      schemaVersion: 1,
      lastUpdated: new Date().toISOString().split('T')[0],
      name: brand.name,
      tenantId: brand.id,
      publicWidgetKey: tenant.apiKey,
      welcomeTitle: brand.welcomeTitle,
      description: brand.description,
      logoUrl: "/assets/placeholders/logo.svg",
      bannerUrl: "/assets/placeholders/banner.webp",
      theme: {
        primaryColor: brand.primaryColor,
        accentColor: brand.accentColor,
        widgetTheme: brand.widgetTheme
      },
      products: [] as any[]
    };

    // 3. Process products and upload placeholders to R2
    for (const product of brand.products) {
      console.log(`   └─ Product: ${product.name}...`);
      
      let publicImageUrl = '';
      const r2Key = `demo/brands/${brand.id}/products/${product.imageName}`;
      
      try {
        await upload(r2Key, placeholderBuffer, 'image/webp');
        publicImageUrl = `${appConfig.r2.publicUrl}/${r2Key}`;
        console.log(`      Upload complete! URL: ${publicImageUrl}`);
      } catch (uploadError: any) {
        console.error(`      ❌ R2 Upload failed: ${uploadError.message}. Using local path fallback.`);
        publicImageUrl = `/assets/placeholders/product.webp`;
      }

      // Upsert Product record in Postgres
      await prisma.product.upsert({
        where: {
          tenantId_shopifyProductId: {
            tenantId: brand.id,
            shopifyProductId: product.shopifyProductId
          }
        },
        update: {
          imageUrl: publicImageUrl,
          preferredGarmentImage: publicImageUrl
        },
        create: {
          tenantId: brand.id,
          shopifyProductId: product.shopifyProductId,
          imageUrl: publicImageUrl,
          preferredGarmentImage: publicImageUrl,
          category: 'tops'
        }
      });
      console.log(`      Garment Product record registered in Postgres.`);

      // Add to config JSON
      brandConfigJson.products.push({
        id: product.id,
        shopifyProductId: product.shopifyProductId,
        name: product.name,
        price: product.price,
        imageUrl: "/assets/placeholders/product.webp"
      });
    }

    generatedConfigs[brand.id] = brandConfigJson;
  }

  console.log('\n======================================================');
  console.log('✅ Seeding Completed successfully!');
  console.log('======================================================\n');
  
  return generatedConfigs;
}

seed()
  .then((configs) => {
    // Write configs to brand directories
    for (const brandId of Object.keys(configs)) {
      const configJsonPath = path.join(BRAND_ASSETS_DIR, brandId, 'config.json');
      fs.writeFileSync(configJsonPath, JSON.stringify(configs[brandId], null, 2));
      console.log(`Updated config at: ${configJsonPath}`);
    }
  })
  .catch((err) => {
    console.error('❌ Seeding failed:', err);
  })
  .finally(() => {
    prisma.$disconnect();
  });
