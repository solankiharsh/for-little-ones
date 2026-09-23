/** Opaque commerce projection: no book content, image URLs, or child details. */
export interface ApprovedRevisionLineItemReference {
  approvedBookRevisionId: string;
  contentHash: string;
  productFormatId: string;
  printSpecId: string;
}

export interface RevisionEligibility extends ApprovedRevisionLineItemReference {
  ownerId: string;
  status: "APPROVED" | "REVOKED";
}

export interface ApprovedRevisionResolver {
  resolve(id: string): Promise<RevisionEligibility | undefined>;
}

export interface CommerceGateway {
  addApprovedItem(input: {
    cartId: string;
    variantId: string;
    quantity: number;
    reference: ApprovedRevisionLineItemReference;
  }): Promise<void>;
}

const fields = ["approvedBookRevisionId", "contentHash", "productFormatId", "printSpecId"] as const;

export function parseRevisionReference(value: unknown): ApprovedRevisionLineItemReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Missing approved revision reference");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !fields.includes(key as typeof fields[number]))) {
    throw new Error("Unexpected personalised metadata");
  }
  for (const field of fields) {
    if (typeof record[field] !== "string" || !(record[field] as string).trim()) throw new Error(`Invalid ${field}`);
  }
  return {
    approvedBookRevisionId: record.approvedBookRevisionId as string,
    contentHash: record.contentHash as string,
    productFormatId: record.productFormatId as string,
    printSpecId: record.printSpecId as string
  };
}

/** Revalidate at checkout; neither client metadata nor a prior cart check is authority. */
export async function validateApprovedItem(input: {
  reference: unknown;
  ownerId: string;
  productFormatId: string;
  quantity: number;
}, resolver: ApprovedRevisionResolver): Promise<ApprovedRevisionLineItemReference> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 5) throw new Error("Invalid quantity");
  const reference = parseRevisionReference(input.reference);
  const approved = await resolver.resolve(reference.approvedBookRevisionId);
  if (!approved || approved.status !== "APPROVED" || approved.ownerId !== input.ownerId) {
    throw new Error("Approved revision unavailable to buyer");
  }
  if (fields.some((field) => approved[field] !== reference[field]) || input.productFormatId !== approved.productFormatId) {
    throw new Error("Approved revision format or hash mismatch");
  }
  return reference;
}

export interface PrintHandoff extends ApprovedRevisionLineItemReference {
  operationKey: string;
  orderId: string;
  itemId: string;
  quantity: number;
}

/** Adapter must persist/deduplicate this business key, not the incoming event id. */
export interface PrintHandoffQueue {
  enqueueOnce(command: PrintHandoff): Promise<void>;
}

export interface PaidOrderProjection {
  id: string;
  ownerId: string;
  paymentStatus: string;
  cancelled: boolean;
  items: { id: string; quantity: number; productFormatId: string; reference: unknown }[];
}

export class CommerceEventAdapter {
  constructor(private readonly revisions: ApprovedRevisionResolver, private readonly queue: PrintHandoffQueue) {}

  async handle(order: PaidOrderProjection): Promise<void> {
    if (order.cancelled || order.paymentStatus !== "captured") return;
    // Validate all lines before emitting any work.
    const commands = await Promise.all(order.items.map(async (item) => ({
      ...await validateApprovedItem({ reference: item.reference, ownerId: order.ownerId,
        productFormatId: item.productFormatId, quantity: item.quantity }, this.revisions),
      operationKey: JSON.stringify(["print", order.id, item.id]),
      orderId: order.id, itemId: item.id, quantity: item.quantity
    })));
    for (const command of commands) await this.queue.enqueueOnce(command);
  }
}
