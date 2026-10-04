import { closeDb, resetOffice } from './helpers/db';

export default async function globalSetup(): Promise<void> {
  await resetOffice();
  await closeDb();
}
