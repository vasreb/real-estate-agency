import { describe, expect, it } from "vitest";
import { apiErrorSchema, MAX_FILE_BYTES } from "./index.js";

describe("shared HTTP foundation", () => {
  it("uses the decimal 25 MB boundary", () => {
    expect(MAX_FILE_BYTES).toBe(25_000_000);
  });
  it("accepts public errors and rejects leaked fields and unknown codes", () => {
    expect(
      apiErrorSchema.parse({ code: "NOT_FOUND", message: "Не найдено" }).code,
    ).toBe("NOT_FOUND");
    expect(
      apiErrorSchema.safeParse({ code: "SQL_ERROR", message: "private" })
        .success,
    ).toBe(false);
    expect(
      apiErrorSchema.safeParse({
        code: "NOT_FOUND",
        message: "x",
        sql: "secret",
      }).success,
    ).toBe(false);
  });
});
