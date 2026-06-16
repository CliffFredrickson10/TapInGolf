import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import http from "http";
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

// Sales presentation — served at both /presentation and /api/presentation
const servePresentation = (_req: express.Request, res: express.Response) => {
  const file = path.resolve(__dirname, "../presentation.html");
  const html = fs.readFileSync(file, "utf-8");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
};
app.get("/presentation", servePresentation);
app.get("/api/presentation", servePresentation);

app.use("/api", router);

// In development, proxy the club-portal Vite dev server so users can access
// it from the default preview port (80) without switching ports.
if (process.env.NODE_ENV !== "production") {
  const PORTAL_PORT = 19606;
  const portalPrefixes = ["/club-portal", "/@vite", "/@fs", "/@id", "/@replit", "/node_modules/.vite"];

  const proxyToPortal = (req: express.Request, res: express.Response) => {
    const options: http.RequestOptions = {
      hostname: "localhost",
      port: PORTAL_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${PORTAL_PORT}` },
    };
    const proxy = http.request(options, (upstream) => {
      res.writeHead(upstream.statusCode ?? 200, upstream.headers);
      upstream.pipe(res, { end: true });
    });
    proxy.on("error", () => res.status(502).send("Club portal dev server unavailable"));
    req.pipe(proxy, { end: true });
  };

  for (const prefix of portalPrefixes) {
    app.use(prefix, (req, res) => {
      req.url = prefix + req.url;
      proxyToPortal(req, res);
    });
  }
}

// In production, serve the built club-portal SPA from the same origin so
// its relative /api calls work.
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
