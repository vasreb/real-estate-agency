import { hashPassword } from "../../../src/modules/auth/index.js";

export function readPasswords(env: NodeJS.ProcessEnv): string[] {
  return Array.from({ length: 10 }, (_, i) => {
    const key = `DEMO_ARCHIVE_PASSWORD_${String(i + 1).padStart(2, "0")}`;
    const password = env[key];
    if (!password || password.length < 12 || password.length > 1024)
      throw new Error(`Valid process-only ${key} required before connecting.`);
    return password;
  });
}
export async function hashPasswords(
  passwords: readonly string[],
): Promise<string[]> {
  const result: string[] = [];
  // Do not multiply Argon2's memory footprint by ten concurrent users.
  for (const password of passwords) result.push(await hashPassword(password));
  return result;
}
