import { prisma } from '@trail/db';
import { upload } from '@trail/storage';
import { config as appConfig } from '@trail/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname since this file runs in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local paths to directories
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'apps/demo-portal/public');
const PLACEHOLDERS_DIR = path.join(PUBLIC_DIR, 'assets/placeholders');
const BRAND_ASSETS_DIR = path.join(PUBLIC_DIR, 'assets/brands');

const BRANDS_LIST = ['effilo', 'onhete', 'october', 'lyvn', 'nappa-dori', 'farak'];

async function seed() {
  console.log('🚀 Starting dynamic demo brands database onboarding and R2 upload...');
  
  const localProductPlaceholderPath = path.join(PLACEHOLDERS_DIR, 'product.webp');
  if (!fs.existsSync(localProductPlaceholderPath)) {
    throw new Error(`Placeholder product image does not exist at ${localProductPlaceholderPath}`);
  }
  const placeholderBuffer = fs.readFileSync(localProductPlaceholderPath);

  for (const brandId of BRANDS_LIST) {
    console.log(`\n📦 Onboarding Brand: ${brandId}...`);
    
    const configPath = path.join(BRAND_ASSETS_DIR, brandId, 'config.json');
    if (!fs.existsSync(configPath)) {
      console.warn(`   ⚠️ Warning: Config file not found for ${brandId} at ${configPath}. Skipping.`);
      continue;
    }

    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // 1. Onboard / Upsert Tenant in PostgreSQL
    const shopifyDomain = `${brandId}.myshopify.com`;
    let tenant = await prisma.tenant.findUnique({
      where: { id: brandId }
    });

    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          id: brandId,
          name: configData.name || brandId,
          shopifyDomain,
          features: ['tryon']
        }
      });
      console.log(`   Tenant created in DB. API Key: ${tenant.apiKey}`);
    } else {
      console.log(`   Tenant already exists in DB. API Key: ${tenant.apiKey}`);
    }

    // Update config with the real, active database API key
    configData.publicWidgetKey = tenant.apiKey;

    // 2. Onboard / Upsert TenantConfig
    const primaryColor = configData.theme?.primaryColor || '#000000';
    const widgetTheme = configData.theme?.widgetTheme || 'dark';

    await prisma.tenantConfig.upsert({
      where: { tenantId: brandId },
      update: {
        primaryColor,
        widgetTheme
      },
      create: {
        tenantId: brandId,
        primaryColor,
        widgetTheme,
        complimentTone: 'friendly',
        segmindModel: 'fashion-tryon-v1'
      }
    });
    console.log(`   TenantConfig synced in Postgres.`);

    // 3. Process products, upload actual custom garments to R2
    if (configData.products && Array.isArray(configData.products)) {
      for (const product of configData.products) {
        console.log(`   └─ Syncing Product: ${product.name} (Shopify ID: ${product.shopifyProductId})...`);
        
        let garmentBuffer = placeholderBuffer;
        let originalFileName = 'product.webp';

        // Resolve local path of the image if it is a brand-specific custom asset
        if (product.imageUrl && product.imageUrl.startsWith('/assets/brands/')) {
          const relativePath = product.imageUrl.substring(1); // Remove leading slash
          const localAssetPath = path.join(PUBLIC_DIR, relativePath);
          
          if (fs.existsSync(localAssetPath)) {
            garmentBuffer = fs.readFileSync(localAssetPath);
            originalFileName = path.basename(localAssetPath);
            console.log(`      Found custom local garment file: ${originalFileName}`);
          } else {
            console.warn(`      ⚠️ Custom garment image not found locally at ${localAssetPath}. Falling back to default placeholder.`);
          }
        } else {
          console.log(`      No custom garment image. Using default placeholder.`);
        }

        // Upload file to R2
        let publicImageUrl = '';
        const r2Key = `demo/brands/${brandId}/products/${originalFileName}`;
        
        try {
          await upload(r2Key, garmentBuffer, 'image/webp');
          publicImageUrl = `${appConfig.r2.publicUrl}/${r2Key}`;
          console.log(`      Uploaded to R2: ${publicImageUrl}`);
        } catch (uploadError: any) {
          console.error(`      ❌ R2 Upload failed: ${uploadError.message}. Using public placeholder fallback.`);
          publicImageUrl = `${appConfig.r2.publicUrl}/demo/placeholders/product.webp`;
        }

        // Register Product record in Neon Postgres
        await prisma.product.upsert({
          where: {
            tenantId_shopifyProductId: {
              tenantId: brandId,
              shopifyProductId: product.shopifyProductId
            }
          },
          update: {
            imageUrl: publicImageUrl,
            preferredGarmentImage: publicImageUrl,
            category: product.category || 'upper'
          },
          create: {
            tenantId: brandId,
            shopifyProductId: product.shopifyProductId,
            imageUrl: publicImageUrl,
            preferredGarmentImage: publicImageUrl,
            category: product.category || 'upper'
          }
        });
        console.log(`      Garment Product registered in Postgres.`);
      }
    }

    // Save updated config JSON back to disk
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
    console.log(`   Config file updated successfully with database API key.`);
  }

  console.log('\n======================================================');
  console.log('✅ Dynamic Onboarding and Seeding Completed successfully!');
  console.log('======================================================\n');
}

seed()
  .catch((err) => {
    console.error('❌ Onboarding failed:', err);
  })
  .finally(() => {
    prisma.$disconnect();
  });
