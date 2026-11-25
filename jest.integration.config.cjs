const baseConfig = require("./jest.config.cjs");

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  ...baseConfig,
  maxWorkers: 2,
  testTimeout: 120000,
  testMatch: ["**/__tests__/integration/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "__tests__/helpers/"],
  setupFilesAfterEnv: [],
};
