// Tripwire: the integration suite must drive the SAME Firestore transport the
// students' laptops use — the browser build's WebChannel — not the Node build's
// gRPC.
//
// Why this test exists. Vitest resolves with Vite's *server* conditions, which
// drop `browser`, and @firebase/firestore's exports map lists `node` before
// `browser`, so by default `firebase/firestore` resolves to dist/index.node.mjs
// and the whole suite talks gRPC. That transport is never shipped, and against
// cloud-firestore-emulator v1.20.4 its Listen stream intermittently
// desynchronises (the emulator loses a ListenResponse framing race —
// `IllegalStateException: knownLengthPendingAllocation reached 0` in its own
// log — and emits a mis-sized frame). The client SDK reads payload bytes as a
// length prefix, raises `RESOURCE_EXHAUSTED: Received message larger than max`,
// classifies it as a retryable STREAM failure, and enters 60s maximum backoff:
// snapshot delivery stops dead, the onSnapshot error callback is never called
// (only server-sent per-target errors reach it), and there is no watchdog for an
// open-but-silent stream. That was the ~1-in-2 season.itest.tsx flake.
//
// vitest.integration.config.ts pins the browser build with an explicit alias
// plus server.deps.inline. If that pin ever stops matching — a firebase upgrade
// renaming a dist file, someone trimming the config — the suite would silently
// fall back to gRPC and the flake would return looking like a fresh mystery.
// This test fails loudly instead.
import { createRequire } from 'node:module';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

test('the integration suite runs the browser (WebChannel) Firestore build, not Node gRPC', async () => {
  // Force a real round-trip so the transport is actually constructed. The read
  // is denied by the rules (no auth, no such game) — irrelevant here; only the
  // fact that a connection was built matters.
  await getDoc(doc(db, 'games', '__transport_tripwire__')).catch(() => {});

  // The Node build does `import '@grpc/grpc-js'`. grpc-js is CommonJS, so once
  // loaded it is present in the process-wide require cache; the browser build
  // pulls in @firebase/webchannel-wrapper instead and never touches it.
  const req = createRequire(import.meta.url);
  let grpcLoaded: boolean;
  try {
    grpcLoaded = req.resolve('@grpc/grpc-js') in req.cache;
  } catch {
    grpcLoaded = false; // not installed at all — certainly not the gRPC build
  }

  expect(grpcLoaded).toBe(false);
});
