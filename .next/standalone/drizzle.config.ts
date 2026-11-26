import { defineConfig } from "drizzle-kit";
import "dotenv/config"; // Wajib ditambahkan agar membaca file .env di Codespace

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
});
