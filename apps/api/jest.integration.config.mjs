import base from "./jest.base.config.mjs";
export default {
  ...base,
  testMatch: ["<rootDir>/test/integration/**/*.test.ts"],
  setupFiles: ["<rootDir>/test/integration-env.mjs"],
  testTimeout: 15000,
};
