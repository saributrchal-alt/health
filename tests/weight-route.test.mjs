import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import test from "node:test";
import { POST } from "../app/api/kiosk/weight/route.js";
import { signedWeightMessage } from "../lib/kiosk-proof.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const device = {
  id: randomUUID(),
  enabled: true,
  public_key_spki_base64: publicKey.export({ type: "spki", format: "der" }).toString("base64")
};
const memberId = randomUUID();
const storageToken = "b".repeat(64);

function setup(t, { authorizedMember = memberId, storageResponse } = {}) {
  const env = {
    HEALTH_KIOSK_WEIGHT_ENABLED: "true",
    HEALTH_WEIGHT_STORAGE_TOKEN: storageToken,
    HEALTH_CARD_HMAC_SECRET: "a".repeat(64),
    NEXT_PUBLIC_SUPABASE_URL: "https://identity.invalid",
    SUPABASE_SECRET_KEY: "sb_secret_test"
  };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  const challenge = { id: randomUUID(), device_id: device.id, issued_at: new Date().toISOString(), used_at: null };
  const proof = {
    device_id: device.id,
    challenge_id: challenge.id,
    citizen_id: "0123456789012",
    reading_id: randomUUID(),
    weight_hundredths: 6400
  };
  proof.signature = sign("sha256", signedWeightMessage(proof), privateKey).toString("base64");
  const storageCalls = [];
  const fetchMock = t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(input);
    if (url.host === "identity.invalid") {
      switch (url.pathname) {
        case "/rest/v1/health_kiosk_devices": return Response.json([device]);
        case "/rest/v1/health_kiosk_challenges": return Response.json([challenge]);
        case "/rest/v1/rpc/health_authorize_kiosk_weight": {
          const body = JSON.parse(init.body);
          assert.deepEqual(Object.keys(body).sort(), [
            "p_card_hmac", "p_challenge_id", "p_citizen_id", "p_device_id", "p_device_key"
          ]);
          return Response.json(authorizedMember);
        }
      }
    }
    assert.equal(url.href, "https://media.nathoeng.com/health-weight.php");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers["X-Health-Weight-Token"], storageToken);
    storageCalls.push(JSON.parse(init.body));
    return storageResponse ?? Response.json({ saved: true, reading_id: proof.reading_id });
  });

  return {
    proof, storageCalls, fetchMock,
    submit: (values = proof) => POST(new Request("https://health.nathoeng.com/api/kiosk/weight", {
      method: "POST", body: JSON.stringify(values)
    }))
  };
}

test("saves an approved member's reading on Hostinger without forwarding card details", async (t) => {
  const { proof, storageCalls, submit } = setup(t);
  const result = await submit();
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { saved: true });
  assert.deepEqual(storageCalls, [{
    reading_id: proof.reading_id,
    member_id: memberId,
    device_id: device.id,
    weight_hundredths: proof.weight_hundredths
  }]);
});

test("does not send a reading when kiosk authorization rejects the member or challenge", async (t) => {
  const { storageCalls, submit } = setup(t, { authorizedMember: null });
  assert.equal((await submit()).status, 403);
  assert.deepEqual(storageCalls, []);
});

test("does not authorize or store a changed reading with the original signature", async (t) => {
  const { proof, fetchMock, submit } = setup(t);
  assert.equal((await submit({ ...proof, weight_hundredths: 6500 })).status, 403);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("does not confirm a save when Hostinger is unavailable", async (t) => {
  const { submit } = setup(t, { storageResponse: Response.json({ saved: false }, { status: 503 }) });
  const result = await submit();
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { saved: false });
});

test("does not confirm a receipt for another reading", async (t) => {
  const { submit } = setup(t, { storageResponse: Response.json({ saved: true, reading_id: randomUUID() }) });
  const result = await submit();
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { saved: false });
});
