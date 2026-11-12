import {
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from "../../src/modules/auth/index.js";

describe("password hashing", () => {
  it("uses Argon2id with the OWASP baseline and never stores plaintext", async () => {
    const hash = await hashPassword(" пароль с пробелами ");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain("пароль");
    await expect(verifyPassword(hash, " пароль с пробелами ")).resolves.toBe(
      true,
    );
  });
  it("rejects wrong passwords, trimmed variants, and malformed hashes", async () => {
    const hash = await hashPassword("correct-password");
    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
    await expect(verifyPassword(hash, " correct-password")).resolves.toBe(
      false,
    );
    await expect(verifyPassword("not-a-hash", "x")).resolves.toBe(false);
  });
  it("normalizes email by trimming and lower-casing", () => {
    expect(normalizeEmail("  Admin@Agency.TEST ")).toBe("admin@agency.test");
  });
});
