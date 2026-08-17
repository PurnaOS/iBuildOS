import { createServer } from "node:http";

const PORT = 4321;

// Simulate a real dev server's brief startup work (compiling, opening a
// database connection, ...) before it's ready to accept connections — the
// harness's preview poll is expected to retry until this fires, not assume
// the server is up on the first attempt.
setTimeout(() => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  server.listen(PORT, () => {
    console.log(`dev server listening on http://localhost:${PORT}`);
  });
}, 300);
