import app from "./app.js";
import env from "./config/env.js";
import { pool } from "./config/db.js";
import { ensureSuperAdminAccount } from "./services/auth.service.js";

const startServer = async () => {
  try {
    await pool.query("SELECT 1");
    console.log("Database connection established.");
  } catch (error) {
    console.warn("Database connection failed at startup:", error.message);
  }

  try {
    await ensureSuperAdminAccount();
    console.log("Super admin account ready.");
  } catch (error) {
    console.warn("Super admin bootstrap failed at startup:", error.message);
  }

  app.listen(env.port, () => {
    console.log(`LOKIFY API listening on http://localhost:${env.port}`);
  });
};

startServer();
