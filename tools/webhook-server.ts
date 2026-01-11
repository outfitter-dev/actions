#!/usr/bin/env bun

const port = parseInt(process.env.PORT || '8787', 10);

const server = Bun.serve({
  port,
  fetch: async (req) => {
    if (req.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }
    try {
      const json = await req.json();
      console.log('[Webhook]', JSON.stringify(json, null, 2));
      return new Response('accepted', { status: 202 });
    } catch (e) {
      return new Response('bad request', { status: 400 });
    }
  },
});

console.log(`Webhook server listening on http://localhost:${port}`);
await server.finished;

