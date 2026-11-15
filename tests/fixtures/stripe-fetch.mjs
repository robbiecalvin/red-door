// Loaded only by apiSmoke.test.ts via Node --import. Never imported by application code.
const origin = process.env.REDDOOR_TEST_STRIPE_ORIGIN;
if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Local Stripe fixture origin required.");
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? input.href);
  if (url.origin === "https://api.stripe.com") return nativeFetch(origin + url.pathname + url.search, options);
  return nativeFetch(input, options);
};
