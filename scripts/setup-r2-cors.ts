/**
 * Setup CORS for R2 bucket
 * Run: npx tsx scripts/setup-r2-cors.ts
 */

import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';

async function setupCORS() {
  try {
    console.log(`🔧 Setting up CORS for R2 bucket: ${BUCKET_NAME}...`);

    const corsConfiguration = {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedOrigins: [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://www.metrum-grup.biz.ua',
            'https://metrum-grup.biz.ua',
          ],
          ExposeHeaders: ['ETag', 'x-amz-request-id'],
          MaxAgeSeconds: 3600,
        },
      ],
    };

    const command = new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: corsConfiguration,
    });

    await s3Client.send(command);

    console.log('✅ CORS configuration applied successfully!');
    console.log('Allowed origins:');
    corsConfiguration.CORSRules[0].AllowedOrigins.forEach(origin => {
      console.log(`  - ${origin}`);
    });

  } catch (error) {
    console.error('❌ Error setting up CORS:', error);
    throw error;
  }
}

setupCORS();
