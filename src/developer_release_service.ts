import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { clientStatus, ReleaseLedger } from "./release_split.js";

const ledger = new ReleaseLedger();

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/build-events") {
      return send(response, 201, { ok: true, data: ledger.recordBuild(await readJson(request)) });
    }
    if (request.method === "POST" && request.url === "/release-operations") {
      return send(response, 201, { ok: true, data: await ledger.release(await readJson(request)) });
    }
    if (request.method === "POST" && request.url === "/diagnostics") {
      return send(response, 200, { ok: true, data: ledger.diagnostics(await readJson(request)) });
    }
    return send(response, 404, { ok: false, error: "route_not_found" });
  } catch (error) {
    return send(response, clientStatus(error), {
      ok: false,
      error: error instanceof Error ? error.message : "request_rejected",
    });
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`Developer release service listening on ${port}`));
}
