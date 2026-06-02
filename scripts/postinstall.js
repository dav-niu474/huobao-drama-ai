// ============================================================
// Postinstall script: generates Prisma client
// On Vercel: the schema is already PostgreSQL (committed as such),
//   so prisma generate here is safe.
// On local: pre-dev.js already generated the SQLite client,
//   so this is a no-op (or regenerates for the current schema).
// ============================================================

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')

try {
  // Read the schema to determine which provider to use
  const schema = fs.readFileSync(schemaPath, 'utf8')
  const isPostgreSQL = schema.includes('provider = "postgresql"')
  const isSQLite = schema.includes('provider = "sqlite"')

  if (!isPostgreSQL && !isSQLite) {
    console.warn('[postinstall] Cannot determine Prisma provider, skipping generate')
    process.exit(0)
  }

  console.log(`[postinstall] Generating Prisma client (${isPostgreSQL ? 'PostgreSQL' : 'SQLite'})...`)

  execSync('npx prisma generate', {
    stdio: 'inherit',
    env: { ...process.env },
    timeout: 120000
  })
  console.log('[postinstall] Prisma client generated successfully')
} catch (error) {
  console.warn('[postinstall] Prisma generate warning:', error.message?.slice(0, 300))
  // Don't fail the install — build.js will also try to generate
}
