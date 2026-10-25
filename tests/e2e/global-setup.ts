import { resetTestDatabase } from '@zro/db/testing'

export default async function setup() {
  await resetTestDatabase(process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test')
}
