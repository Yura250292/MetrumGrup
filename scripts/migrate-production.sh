#!/bin/bash
# Production database migration script
# Run this on Vercel after deployment

echo "🔄 Applying production database migration..."

# Apply the specific migration SQL file
npx prisma db execute --file prisma/migrations/20250331_add_tax_breakdown_fields/migration.sql --schema prisma/schema.prisma

echo "✅ Migration completed!"
echo "🔄 Generating Prisma Client..."

# Regenerate Prisma Client
npx prisma generate

echo "✅ Prisma Client regenerated!"
echo "🎉 Production database is ready!"
