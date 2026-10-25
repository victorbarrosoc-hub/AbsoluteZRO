// Recria o banco de teste (nome terminado em _test) e aplica as migrations antes da bateria.
import { resetTestDatabase, TEST_DATABASE_URL } from '@zro/db/testing'

export default async function setup() {
  process.env.TEST_DATABASE_URL = TEST_DATABASE_URL
  await resetTestDatabase(TEST_DATABASE_URL)
}
