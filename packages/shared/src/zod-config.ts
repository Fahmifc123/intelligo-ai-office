import { z } from 'zod';

// In the browser, Zod v4 probes `new Function` to enable its JIT parser. The web CSP forbids
// eval, so the probe would be reported as a violation; the interpreter is fast enough there.
// Servers keep the JIT.
if ('document' in globalThis) z.config({ jitless: true });
