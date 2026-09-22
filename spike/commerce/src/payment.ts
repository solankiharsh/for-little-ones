import type { PaymentRequest, PaymentResult, PaymentState } from "./order";

export type WebhookKind = "payment.authorized" | "payment.captured" | "payment.failed";

export interface PaymentWebhook {
  eventId: string;
  kind: WebhookKind;
  paymentId: string;
  deliveredAt: string;
}

/**
 * Sandbox payment provider with the duplicate-webhook/idempotency semantics the
 * self-built path must match: delivery is at-least-once, so settling must be
 * idempotent on the webhook event id and capture must be single-shot.
 */
export class SandboxPayment {
  private readonly states = new Map<string, PaymentState>();
  private readonly settledEvents = new Set<string>();

  authorize(req: PaymentRequest): PaymentResult {
    const paymentId = `pay_${this.states.size + 1}`;
    this.states.set(paymentId, "requires_capture");
    return { paymentId, state: "requires_capture" };
  }

  /** Deliver a webhook. Re-delivering the same eventId is a no-op. */
  deliver(hook: PaymentWebhook): { state: PaymentState; deduped: boolean } {
    if (this.settledEvents.has(hook.eventId)) {
      return { state: this.states.get(hook.paymentId) ?? "failed", deduped: true };
    }
    this.settledEvents.add(hook.eventId);
    return { state: this.states.get(hook.paymentId) ?? "failed", deduped: false };
  }

  /** Approve a capture for a payment that reached "requires_capture". Single-shot. */
  capture(req: PaymentRequest, paymentId: string, eventId: string): PaymentWebhook {
    const hook: PaymentWebhook = {
      eventId,
      kind: this.states.get(paymentId) === "requires_capture" ? "payment.captured" : "payment.failed",
      paymentId,
      deliveredAt: new Date().toISOString()
    };
    const delivery = this.deliver(hook);
    if (delivery.deduped) {
      return { ...hook, kind: "payment.failed" };
    }
    const current = this.states.get(paymentId);
    if (current === "requires_capture") {
      this.states.set(paymentId, "captured");
    }
    return hook;
  }

  fail(paymentId: string, eventId: string): PaymentWebhook {
    const hook: PaymentWebhook = { eventId, kind: "payment.failed", paymentId, deliveredAt: new Date().toISOString() };
    if (!this.deliver(hook).deduped) this.states.set(paymentId, "failed");
    return hook;
  }

  state(paymentId: string): PaymentState {
    return this.states.get(paymentId) ?? "failed";
  }
}
