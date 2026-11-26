import { lookupCard } from "../../../../lib/card-binding.mjs";
import { config, db } from "../../../../lib/kiosk-db.mjs";
import { resultWeightProof, signedWeightMessage, validUuid } from "../../../../lib/kiosk-proof.mjs";

export const runtime = "nodejs";
const storageEndpoint = "https://media.nathoeng.com/health-weight.php";

function reply(status) {
  return Response.json({ saved: status === 200 }, {
    status, headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request) {
  if (process.env.HEALTH_KIOSK_WEIGHT_ENABLED !== "true") return reply(503);

  let proof;
  try {
    if (Number(request.headers.get("content-length")) > 2048) return reply(413);
    const raw = await request.text();
    if (raw.length > 2048) return reply(413);
    proof = JSON.parse(raw);
    signedWeightMessage(proof);
    if (typeof proof.signature !== "string" || proof.signature.length > 700) return reply(400);
  } catch {
    return reply(400);
  }

  const storageToken = process.env.HEALTH_WEIGHT_STORAGE_TOKEN;
  if (!/^[a-f0-9]{64}$/.test(storageToken ?? "")) {
    console.error("Health weight storage token is missing or invalid");
    return reply(503);
  }

  try {
    const c = config();
    const [devices, challenges] = await Promise.all([
      db(c, `health_kiosk_devices?id=eq.${proof.device_id}&select=id,enabled,public_key_spki_base64&limit=1`),
      db(c, `health_kiosk_challenges?id=eq.${proof.challenge_id}&select=id,device_id,issued_at,used_at&limit=1`)
    ]);
    if (!resultWeightProof(proof, devices[0], challenges[0])) return reply(403);

    const memberId = await db(c, "rpc/health_authorize_kiosk_weight", {
      method: "POST",
      body: JSON.stringify({
        p_challenge_id: proof.challenge_id,
        p_device_id: proof.device_id,
        p_device_key: devices[0].public_key_spki_base64,
        p_card_hmac: lookupCard(proof.citizen_id, c.secret),
        p_citizen_id: proof.citizen_id
      })
    });
    if (!validUuid(memberId)) return reply(403);

    const stored = await fetch(storageEndpoint, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(4000),
      headers: {
        "Content-Type": "application/json",
        "X-Health-Weight-Token": storageToken
      },
      body: JSON.stringify({
        reading_id: proof.reading_id,
        member_id: memberId,
        device_id: proof.device_id,
        weight_hundredths: proof.weight_hundredths
      })
    });
    if (stored.status === 409) return reply(409);
    if (stored.status !== 200) {
      console.error("Health weight storage returned HTTP %d", stored.status);
      return reply(503);
    }
    const receipt = await stored.json();
    if (receipt?.saved !== true || receipt.reading_id !== proof.reading_id.toLowerCase()) {
      console.error("Health weight storage returned an invalid receipt");
      return reply(503);
    }
    return reply(200);
  } catch {
    console.error("Health weight authorization or storage unavailable");
    return reply(503);
  }
}
