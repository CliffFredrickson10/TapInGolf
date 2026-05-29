import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve downloaded club logos from the logos/ directory (sibling of dist/)
const logosDir = path.resolve(__dirname, "../logos");
app.use("/api/logos", express.static(logosDir));

app.use("/api", router);

// In production, serve the built club-portal SPA from the same origin so
// its relative /api calls work. Dev is unaffected (workflows run separately).
if (process.env.NODE_ENV === "production") {
  const clientDir = path.resolve(__dirname, "../../club-portal/dist/public");
  app.use(express.static(clientDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });
}

// Global error handler — returns JSON instead of Express default HTML
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status ?? err.statusCode ?? 500;
  const message = status === 500 ? "Internal server error" : (err.message ?? "Error");
  if (status === 500) logger.error({ err }, "Unhandled error");
  res.status(status).json({ message });
});

export default app;
