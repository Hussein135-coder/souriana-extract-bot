import express, { Express } from "express";
import config from "./config";

/**
 * Initialize and configure the Express server
 */
export function initServer(): Express {
  const app = express();
  const port = config.server.port;

  // Basic route for health check
  app.get("/", (req, res) => {
    res.send("Telegram bot is running!");
  });

  // Start the Express server
  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  });

  return app;
}
