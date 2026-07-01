import type { BrandConfig } from '../types';

export function applyBrandMeta(brand: BrandConfig) {
  // 1. Title
  document.title = `${brand.name} — AI Virtual Try-On`;

  // 2. Favicon
  const faviconLink = (document.querySelector("link[rel~='icon']") as HTMLLinkElement) || document.createElement('link');
  faviconLink.rel = 'icon';
  faviconLink.href = brand.logoUrl;
  if (!faviconLink.parentNode) {
    document.head.appendChild(faviconLink);
  }

  // 3. Theme Color (Mobile browser header background bar color)
  let themeMeta = document.querySelector("meta[name='theme-color']") as HTMLMetaElement;
  if (!themeMeta) {
    themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    document.head.appendChild(themeMeta);
  }
  themeMeta.content = brand.theme.primaryColor;

  // 4. OpenGraph SEO Tags
  updateMetaTag('property', 'og:title', `${brand.name} AI Try-On`);
  updateMetaTag('property', 'og:description', brand.description);
  updateMetaTag('property', 'og:image', brand.bannerUrl);
  
  // 5. Twitter SEO Tags
  updateMetaTag('name', 'twitter:title', `${brand.name} AI Try-On`);
  updateMetaTag('name', 'twitter:description', brand.description);
  updateMetaTag('name', 'twitter:image', brand.bannerUrl);
}

export function resetMeta() {
  document.title = 'AI Virtual Try-On Sandbox';
  
  const faviconLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (faviconLink) {
    faviconLink.href = '/favicon.ico';
  }

  const themeMeta = document.querySelector("meta[name='theme-color']") as HTMLMetaElement;
  if (themeMeta) {
    themeMeta.content = '#000000';
  }
}

function updateMetaTag(attributeName: string, attributeValue: string, content: string) {
  let meta = document.querySelector(`meta[${attributeName}='${attributeValue}']`) as HTMLMetaElement;
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attributeName, attributeValue);
    document.head.appendChild(meta);
  }
  meta.content = content;
}
