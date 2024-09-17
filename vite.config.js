import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "192.168.100.7", // Your IP address
    port: 3000, // Your port
    https: {
      key: fs.readFileSync(path.resolve(__dirname, "192.168.100.7-key.pem")),
      cert: fs.readFileSync(path.resolve(__dirname, "192.168.100.7.pem")),
    },
  },
});
