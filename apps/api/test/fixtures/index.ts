/**
 * Test-only credentials for the isolated agency_test database. They are never
 * used by the development seed, which reads passwords from the environment.
 */
export const testPasswords = {
  admin: "test-admin-password-north",
  member: "test-member-password-north",
  other: "test-other-password-south",
  multi: "test-multi-password-both",
} as const;

export {
  ids,
  baseAccounts,
  multiTeamAccount,
  deals,
} from "../../prisma/seed-data.js";
export {
  createSamplePdf,
  createSampleDocx,
  PDF_MIME,
  DOCX_MIME,
} from "../../prisma/sample-documents.js";
