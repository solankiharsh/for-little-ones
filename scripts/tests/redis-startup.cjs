#!/usr/bin/env node
// Integration probe for the pinned Medusa 2.21.1 event bus. Uses a unique queue.
// TEST_REDIS_URL must point at a disposable/sandbox TLS Redis instance.
const path = require('node:path');
const tls = require('node:tls');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const projectIndex = process.argv.indexOf('--project');
const redisUrl = projectIndex >= 0
  ? execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest',
      '--secret=commerce_REDIS_URL', '--project='+process.argv[projectIndex+1]],
      {encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim()
  : process.env.TEST_REDIS_URL;
if (!redisUrl || !redisUrl.startsWith('rediss://')) {
  console.error('Set TEST_REDIS_URL to a sandbox TLS Redis URL, or pass --project PROJECT.');
  process.exit(2);
}
Object.assign(process.env, {NODE_ENV:'test', COMMERCE_SANDBOX:'true', REDIS_URL:redisUrl,
  DATABASE_URL:'postgres://build:build@localhost/build', JWT_SECRET:'test', COOKIE_SECRET:'test',
  TS_NODE_PROJECT:path.join(root, 'apps/commerce/tsconfig.json')});
require('ts-node/register/transpile-only');
const config = require(path.join(root, 'apps/commerce/medusa-config.ts'));
const { createContainer, asValue } = require('awilix');
const load = require('@medusajs/event-bus-redis/dist/loaders').default;
const Service = require('@medusajs/event-bus-redis/dist/services/event-bus-redis').default;
let delivered = false;
let workerFailed = false;
let stalled = false;
let service;
let connection;
const deadline = setTimeout(() => { console.error('FAIL: probe exceeded 45 seconds'); process.exit(1); }, 45000);
const originalConnect = tls.connect;
const logger = {info:()=>{}, warn:()=>{}, error:()=>{workerFailed=true;}};
// BullMQ emits socket errors to console; do not print raw connection objects/URLs.
const originalError = console.error;
console.error = () => { workerFailed = true; };
process.on('unhandledRejection', () => { workerFailed = true; });
(async () => {
  const container = createContainer();
  container.register({logger:asValue(logger)});
  const options = {...config.modules.event_bus.options,
    queueName:'flo-startup-probe-'+randomUUID()};
  if (process.argv.includes('--baseline')) options.redisOptions = {};
  await load({container, logger, options});
  connection = container.resolve('eventBusRedisConnection');
  // Stall only the next TLS connection, after TCP connects but before TLS finishes.
  // The main module connection is already healthy at this point.
  tls.connect = function (...args) {
    const socket = originalConnect.apply(this, args);
    tls.connect = originalConnect;
    socket.once('connect', () => {
      stalled = true;
      const end = Date.now()+12000;
      while (Date.now()<end) { /* simulate synchronous Medusa startup work */ }
    });
    return socket;
  };
  service = new Service(container.cradle, {}, {worker_mode:'shared'});
  service.subscribe('flo.startup.probe', async () => { delivered=true; }, {subscriberId:'probe'});
  await new Promise(resolve => setTimeout(resolve, 15000));
  await service.__hooks.onApplicationStart();
  await service.emit({name:'flo.startup.probe', data:{synthetic:true}});
  const until = Date.now()+5000;
  while (!delivered && Date.now()<until) await new Promise(resolve => setTimeout(resolve, 100));
  const passed = delivered && stalled && !workerFailed;
  console.log(passed ? 'PASS: event delivered after worker TLS startup stall' : 'FAIL: worker startup error or event not delivered');
  process.exitCode = passed ? 0 : 1;
})().catch(() => { console.log('FAIL: Redis startup probe failed'); process.exitCode=1; }).finally(async () => {
  tls.connect = originalConnect;
  if (service) {
    await service.__hooks.onApplicationPrepareShutdown();
    // Remove only this run's randomly named diagnostic queue, including failed jobs.
    await service.queue_.obliterate({force:true});
    await service.__hooks.onApplicationShutdown();
  } else if (connection) connection.disconnect();
  console.error = originalError;
  clearTimeout(deadline);
});
