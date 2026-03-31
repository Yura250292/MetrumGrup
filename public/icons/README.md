# PWA Icons

Для повноцінної роботи PWA необхідно створити наступні іконки з логотипу Metrum Group:

## Required Icons

1. **favicon.ico** (16x16, 32x32, 48x48) - для браузерної вкладки
2. **apple-touch-icon.png** (180x180) - для iOS home screen
3. **icon-72x72.png** - Android launcher
4. **icon-96x96.png** - Android launcher
5. **icon-128x128.png** - Android launcher
6. **icon-144x144.png** - Android launcher
7. **icon-152x152.png** - iOS devices
8. **icon-192x192.png** - Android devices (maskable)
9. **icon-384x384.png** - High-res displays
10. **icon-512x512.png** - Splash screens (maskable)

## Design Guidelines

- **Primary Color**: #FF8400 (Metrum orange)
- **Background**: White (#ffffff) or transparent
- **Format**: PNG with transparency
- **Maskable icons**: Add 10% padding for safe zone (192x192 and 512x512)

## How to Generate

### Option 1: Using online tool
Visit https://realfavicongenerator.net/ and upload your logo

### Option 2: Using ImageMagick
```bash
# From source logo (logo.svg or logo.png)
convert logo.png -resize 72x72 icon-72x72.png
convert logo.png -resize 96x96 icon-96x96.png
convert logo.png -resize 128x128 icon-128x128.png
convert logo.png -resize 144x144 icon-144x144.png
convert logo.png -resize 152x152 icon-152x152.png
convert logo.png -resize 192x192 icon-192x192.png
convert logo.png -resize 384x384 icon-384x384.png
convert logo.png -resize 512x512 icon-512x512.png
convert logo.png -resize 180x180 apple-touch-icon.png
```

### Option 3: Using PWA Asset Generator
```bash
npx pwa-asset-generator logo.svg ./public/icons
```

## Current Status

❌ Icons not yet generated - **ACTION REQUIRED**

Please generate icons from the Metrum Group logo and place them in this directory.
