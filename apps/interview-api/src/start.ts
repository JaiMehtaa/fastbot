import { createServer } from "./server.js";
import { createProductionDeps } from "./production-deps.js";

const app = createServer(createProductionDeps());
const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`interview-api listening on :${port}`);
  })
  .catch((error: unknown) => {
    console.error("interview-api failed to start:", error);
    process.exit(1);
  });
