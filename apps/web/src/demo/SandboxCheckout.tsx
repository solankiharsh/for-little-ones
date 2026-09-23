import { useState } from "react";

const MEDUSA_URL = import.meta.env.VITE_MEDUSA_URL ?? "http://localhost:9000";
const PUBLISHABLE_KEY = import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY as string | undefined;

interface CheckoutResult {
  orderId: string;
  total: number;
  currencyCode: string;
  receiptKey: string | null;
  deduped: boolean;
}

export default function SandboxCheckout() {
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);

  async function buy(replay: boolean) {
    if (status === "working") return;
    if (!PUBLISHABLE_KEY) {
      setStatus("error");
      setError("Missing VITE_MEDUSA_PUBLISHABLE_KEY — run the commerce sandbox-config script and add it to apps/web/.env.local.");
      return;
    }
    const key = replay && lastKey ? lastKey : crypto.randomUUID();
    setStatus("working");
    setError(null);
    try {
      const response = await fetch(`${MEDUSA_URL}/store/flo/sandbox-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
          "x-flo-idempotency-key": key,
        },
      });
      const body = (await response.json()) as CheckoutResult & { message?: string };
      if (!response.ok) throw new Error(body.message ?? `Checkout failed (${response.status})`);
      setResult(body);
      setLastKey(key);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Checkout failed");
    }
  }

  return (
    <section className="flo-demo" aria-label="Sandbox purchase demo">
      <div className="flo-demo-inner">
        <p className="flo-kicker">Sandbox demo · no real charge</p>
        <h2>Buy the sample book, end to end.</h2>
        <p>
          This runs a real Medusa checkout against the local sandbox: the fixture
          approved revision goes into a cart, pays £29.20 through the local test
          provider, and queues one fake print handoff. Nothing is printed or charged.
        </p>
        <div className="flo-demo-actions">
          <button
            type="button"
            className="flo-btn flo-btn-primary flo-btn-lg"
            disabled={status === "working"}
            onClick={() => void buy(false)}
          >
            {status === "working" ? "Placing your order…" : "Buy sample book — £29.20 (sandbox)"}
          </button>
          <button
            type="button"
            className="flo-btn flo-btn-ghost"
            disabled={status === "working" || !lastKey}
            onClick={() => void buy(true)}
          >
            Replay last request (same key)
          </button>
        </div>
        {status === "done" && result && (
          <p className="flo-demo-result" role="status">
            {result.deduped ? "Same order returned — no duplicate charge. " : "Order placed. "}
            Order <code>{result.orderId}</code> · £{result.total.toFixed(2)} {result.currencyCode.toUpperCase()}
            {result.receiptKey ? <> · print receipt queued</> : null}
          </p>
        )}
        {status === "error" && error && (
          <p className="flo-demo-error" role="alert">{error}</p>
        )}
      </div>
    </section>
  );
}
