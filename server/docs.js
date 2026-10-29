import fs from "node:fs";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

const SPEC_FILE = new URL("../docs/openapi.yaml", import.meta.url);

// Swagger UI is a web page that loads its own scripts and styles, so this
// router sets its own Content-Security-Policy. It keeps helmet's strict
// defaults and turns off only "upgrade-insecure-requests" (null disables a
// default directive), which would force https on a plain http local page.
export function createDocsRouter() {
  const spec = YAML.parse(fs.readFileSync(SPEC_FILE, "utf8"));

  const router = express.Router();
  router.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: { "upgrade-insecure-requests": null },
      },
    }),
  );
  router.use(
    "/",
    swaggerUi.serve,
    swaggerUi.setup(spec, { customSiteTitle: "Game API docs" }),
  );
  return router;
}
