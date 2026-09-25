import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import {
  createProductsWorkflow, createRegionsWorkflow, createSalesChannelsWorkflow,
  createShippingOptionsWorkflow, createStockLocationsWorkflow, createApiKeysWorkflow,
  linkSalesChannelsToApiKeyWorkflow, linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow, createTaxRegionsWorkflow
} from "@medusajs/medusa/core-flows";
import { database, FORMAT, fixtureReference } from "../lib/approvals";

export default async function seed({ container }: ExecArgs) {
  const db = database(container);
  if (!await db.schema.hasTable("flo_sandbox_approval")) await db.schema.createTable("flo_sandbox_approval", (table) => {
    table.text("id").primary(); table.text("owner_id").notNullable(); table.text("content_hash").notNullable();
    table.text("format_id").notNullable(); table.text("print_spec_id").notNullable(); table.text("status").notNullable();
  });
  if (!await db.schema.hasTable("flo_print_outbox")) await db.schema.createTable("flo_print_outbox", (table) => {
    table.text("key").primary(); table.jsonb("payload").notNullable(); table.timestamp("completed_at").nullable();
  });
  if (!await db.schema.hasTable("flo_fake_print_receipt")) await db.schema.createTable("flo_fake_print_receipt", (table) => {
    table.text("key").primary(); table.text("order_id").notNullable(); table.text("approved_revision_id").notNullable(); table.text("content_hash").notNullable();
  });
  if (!await db.schema.hasTable("flo_idempotency")) await db.schema.createTable("flo_idempotency", (table) => {
    table.text("key").primary(); table.text("order_id").notNullable().defaultTo("");
  });
  if (!await db.schema.hasTable("flo_creation_project")) await db.schema.createTable("flo_creation_project", (table) => {
    table.text("id").primary(); table.text("owner_token_hash").notNullable(); table.text("entitlement").notNullable().defaultTo("TEASER");
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now()); table.timestamp("updated_at").notNullable().defaultTo(db.fn.now());
  });
  if (!await db.schema.hasTable("flo_creation_revision")) await db.schema.createTable("flo_creation_revision", (table) => {
    table.text("id").primary(); table.text("project_id").notNullable().references("id").inTable("flo_creation_project").onDelete("CASCADE");
    table.integer("version").notNullable(); table.text("status").notNullable(); table.jsonb("draft").notNullable(); table.jsonb("teaser").nullable();
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now()); table.timestamp("updated_at").notNullable().defaultTo(db.fn.now());
    table.unique(["project_id", "version"]);
  });
  if (!await db.schema.hasTable("flo_generation_job")) await db.schema.createTable("flo_generation_job", (table) => {
    table.text("id").primary(); table.text("project_id").notNullable().references("id").inTable("flo_creation_project").onDelete("CASCADE");
    table.text("revision_id").notNullable().references("id").inTable("flo_creation_revision").onDelete("CASCADE");
    table.text("kind").notNullable(); table.text("status").notNullable(); table.integer("progress").notNullable().defaultTo(0); table.text("error_code").nullable();
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now()); table.timestamp("updated_at").notNullable().defaultTo(db.fn.now());
  });
  const customers = container.resolve(Modules.CUSTOMER);
  const buyer = (await customers.listCustomers({ email: "buyer@example.test" }))[0] ??
    await customers.createCustomers({ email: "buyer@example.test" });
  await db("flo_sandbox_approval").insert({ id: fixtureReference.approvedBookRevisionId, owner_id: buyer.id,
    content_hash: fixtureReference.contentHash, format_id: FORMAT, print_spec_id: fixtureReference.printSpecId, status: "APPROVED" }).onConflict("id").ignore();

  const channels = container.resolve(Modules.SALES_CHANNEL);
  const channel = (await channels.listSalesChannels({ name: "FLO Sandbox" }))[0] ??
    (await createSalesChannelsWorkflow(container).run({ input: { salesChannelsData: [{ name: "FLO Sandbox" }] } })).result[0];
  const stores = container.resolve(Modules.STORE);
  const [store] = await stores.listStores();
  await updateStoresWorkflow(container).run({ input: { selector: { id: store.id }, update: {
    default_sales_channel_id: channel.id, supported_currencies: [{ currency_code: "gbp", is_default: true }]
  } } });
  const regions = container.resolve(Modules.REGION);
  const region = (await regions.listRegions({ name: "UK Sandbox" }))[0] ??
    (await createRegionsWorkflow(container).run({ input: { regions: [{ name: "UK Sandbox", currency_code: "gbp", countries: ["gb"],
      payment_providers: ["pp_system_default", ...(process.env.STRIPE_API_KEY ? ["pp_stripe_stripe"] : [])] }] } })).result[0];
  const tax = container.resolve(Modules.TAX);
  if (!(await tax.listTaxRegions({ country_code: "gb" })).length) {
    await createTaxRegionsWorkflow(container).run({ input: [{ country_code: "gb", provider_id: "tp_system" }] });
  }
  const fulfillment = container.resolve(Modules.FULFILLMENT);
  const profile = (await fulfillment.listShippingProfiles({ type: "default" }))[0] ??
    await fulfillment.createShippingProfiles({ name: "Book shipping", type: "default" });
  const stocks = container.resolve(Modules.STOCK_LOCATION);
  const location = (await stocks.listStockLocations({ name: "FLO Fake Printer" }))[0] ??
    (await createStockLocationsWorkflow(container).run({ input: { locations: [{ name: "FLO Fake Printer", address: { country_code: "gb", city: "London", address_1: "Sandbox" } }] } })).result[0];
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  // Link upserts are handled by the built-in workflows; the fulfilment set is created once.
  const sets = await fulfillment.listFulfillmentSets({ name: "FLO Sandbox delivery" }, { relations: ["service_zones"] });
  let set = sets[0];
  if (!set) {
    set = await fulfillment.createFulfillmentSets({ name: "FLO Sandbox delivery", type: "shipping",
      service_zones: [{ name: "UK", geo_zones: [{ type: "country", country_code: "gb" }] }] });
    await link.create({ [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.FULFILLMENT]: { fulfillment_set_id: set.id } });
    await link.create({ [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" } });
  }
  await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: location.id, add: [channel.id] } });
  if (!(await fulfillment.listShippingOptions({ name: "Sandbox standard" })).length) {
    await createShippingOptionsWorkflow(container).run({ input: [{ name: "Sandbox standard", price_type: "flat", provider_id: "manual_manual",
      service_zone_id: set.service_zones[0].id, shipping_profile_id: profile.id,
      type: { label: "Sandbox", description: "Fake printer; no delivery promise", code: "sandbox" },
      prices: [{ currency_code: "gbp", amount: 0 }, { region_id: region.id, amount: 0 }],
      rules: [{ attribute: "enabled_in_store", value: "true", operator: "eq" }, { attribute: "is_return", value: "false", operator: "eq" }]
    }] });
  }
  const products = container.resolve(Modules.PRODUCT);
  if (!(await products.listProducts({ handle: "personalised-book" })).length) {
    await createProductsWorkflow(container).run({ input: { products: [{ title: "Personalised children's book", handle: "personalised-book",
      status: ProductStatus.PUBLISHED, shipping_profile_id: profile.id, options: [{ title: "Format", values: ["Hardcover square"] }],
      variants: [{ title: "Hardcover square", sku: FORMAT, manage_inventory: false, options: { Format: "Hardcover square" },
        prices: [{ currency_code: "gbp", amount: 29.2 }] }], sales_channels: [{ id: channel.id }] }] } });
  }
  const keys = container.resolve(Modules.API_KEY);
  const key = (await keys.listApiKeys({ title: "FLO Sandbox Store" }))[0] ??
    (await createApiKeysWorkflow(container).run({ input: { api_keys: [{ title: "FLO Sandbox Store", type: "publishable", created_by: "" }] } })).result[0];
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [channel.id] } });
  console.log("FLO sandbox publishable key:", (key as { token?: string }).token ?? key.id);
  console.log("Sandbox seeded: one UK/GBP region, hardcover £29.20, synthetic buyer + approval, fake printer.");
}
