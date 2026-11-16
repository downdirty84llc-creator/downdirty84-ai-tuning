import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverOnboarding } from "./onboarding_outbox.js";

test("onboarding mints on the locked transaction connection, never another pool checkout", async () => {
  const calls: string[] = [];
  const query = async <T>(sql: string): Promise<T[]> => {
    calls.push(sql);
    if (sql.includes("SELECT")) return [{customer_email:"synthetic@example.test",service_label:"Log review",amount_cents:3900,currency:"usd",delivered_at:null}] as T[];
    return [];
  };
  await deliverOnboarding("cs_synthetic", {
    transaction: async fn => fn({query}),
    mintLink: async (_email, execute) => {
      assert.equal(execute, query);
      await execute!("INSERT INTO synthetic_token");
      return {url:"https://example.test/synthetic",ttlMinutes:15};
    },
    send: async () => ({ok:true,transport:"CONSOLE",id:null})
  });
  assert(calls[0].includes("FOR UPDATE"));
  assert(calls.at(-1)?.includes("delivered_at=now()"));
});
