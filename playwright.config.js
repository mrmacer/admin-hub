import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/editor-browser.spec.js",
  timeout: 70000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:4175",
    headless: true
  },
  webServer: {
    command: "PORT=4175 npm start",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: true,
    timeout: 120000
  }
});
