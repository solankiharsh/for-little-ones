import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createApiKeysWorkflow, linkSalesChannelsToApiKeyWorkflow } from "@medusajs/medusa/core-flows";

/** Mints a fresh publishable key for the sandbox channel and prints web config. */
export default async function printSandboxConfig({ container }: ExecArgs) {
  const [channel] = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({ name: "FLO Sandbox" });
  if (!channel) throw new Error("Run seed first");
  const { result: [key] } = await createApiKeysWorkflow(container).run({
    input: { api_keys: [{ title: `FLO Sandbox Store ${new Date().toISOString()}`, type: "publishable", created_by: "sandbox-config" }] },
  });
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [channel.id] } });
  console.log(JSON.stringify({ medusaUrl: "http://localhost:9000", publishableKey: (key as { token?: string }).token ?? null }));
}
