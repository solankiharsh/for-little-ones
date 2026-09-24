import { defineConfig, loadEnv } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());
// The foundation uses synthetic approval records; it must never serve real purchases.
if (process.env.COMMERCE_SANDBOX !== "true" || process.env.NODE_ENV === "production") {
  throw new Error("Commerce foundation requires COMMERCE_SANDBOX=true and a non-production environment");
}
for (const key of ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "COOKIE_SECRET"]) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}
const stripe = process.env.STRIPE_API_KEY;
if (stripe && !stripe.startsWith("sk_test_")) throw new Error("Only Stripe test keys are allowed");

module.exports = defineConfig({
  admin: { disable: true },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: "http://localhost:5173,http://localhost:5174,https://for-little-ones.vercel.app", adminCors: "http://localhost:9000", authCors: "http://localhost:5173,http://localhost:5174,https://for-little-ones.vercel.app",
      jwtSecret: process.env.JWT_SECRET!, cookieSecret: process.env.COOKIE_SECRET!
    }
  },
  modules: [
    { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl: process.env.REDIS_URL } },
    { resolve: "@medusajs/medusa/workflow-engine-redis", options: { redis: { url: process.env.REDIS_URL } } },
    ...(stripe ? [{ resolve: "@medusajs/medusa/payment", options: {
      providers: [{ resolve: "@medusajs/medusa/payment-stripe", id: "stripe", options: {
        apiKey: stripe, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET, capture: true
      } }]
    } }] : [])
  ]
});
