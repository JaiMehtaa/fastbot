import { createServer } from "./server.js";
import { createProductionDeps } from "./production-deps.js";

const sandboxPhoneNumberId = process.env.SANDBOX_PHONE_NUMBER_ID;
if (!sandboxPhoneNumberId) {
  throw new Error("SANDBOX_PHONE_NUMBER_ID is not set — required to distinguish sandbox traffic from live tenants.");
}

const sandboxWhatsAppNumber = process.env.SANDBOX_WHATSAPP_NUMBER;
if (!sandboxWhatsAppNumber) {
  throw new Error("SANDBOX_WHATSAPP_NUMBER is not set — the real, dialable number used to render wa.me join links.");
}

const app = createServer(createProductionDeps({ sandboxPhoneNumberId, sandboxWhatsAppNumber }));
const port = Number(process.env.PORT ?? 3002);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`runtime listening on :${port}`);
  })
  .catch((error: unknown) => {
    console.error("runtime failed to start:", error);
    process.exit(1);
  });
