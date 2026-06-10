import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
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
// Stitch Express webhooks are Svix-signed — the signature is computed over the
// raw request bytes, so this route must receive the unparsed body. Mount the raw
// parser BEFORE express.json() so the global JSON parser doesn't consume it.
app.use("/api/stitch/webhook", express.raw({ type: "*/*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve downloaded club logos from the logos/ directory (sibling of dist/)
const logosDir = path.resolve(__dirname, "../logos");
app.use("/api/logos", express.static(logosDir));

// Health check — used by mobile keep-alive ping and uptime monitors
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// HTML smoke-test — tiny response to check if proxy allows non-/api HTML
app.get("/ping-html", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send("<h1>ok</h1>");
});

// Sales presentation — served at /presentation
app.get("/presentation", (_req, res) => {
  const file = path.resolve(__dirname, "../presentation.html");
  const html = fs.readFileSync(file, "utf-8");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

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
