import { lookupCard } from "../../../../lib/card-binding.mjs";
import { config, db } from "../../../../lib/kiosk-db.mjs";
import { resultWeightProof, signedWeightMessage } from "../../../../lib/kiosk-proof.mjs";

export const runtime = "nodejs";

function reply(status) {
  return Response.json({ saved: status === 200 }, {
    status, headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request) {
  if (process.env.HEALTH_KIOSK_WEIGHT_ENABLED !== "true") return reply(503);

  let proof;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply(413);
    proof = JSON.parse(raw);
    signedWeightMessage(proof);
    if (typeof proof.signature !== "string" || proof.signature.length > 700) return reply(400);
  } catch {
    return reply(400);
  }

  try {
    const c = config();
    const [devices, challenges] = await Promise.all([
      db(c, `health_kiosk_devices?id=eq.${proof.device_id}&select=id,enabled,public_key_spki_base64&limit=1`),
      db(c, `health_kiosk_challenges?id=eq.${proof.challenge_id}&select=id,device_id,issued_at,used_at&limit=1`)
    ]);
    if (!resultWeightProof(proof, devices[0], challenges[0])) return reply(403);

    const saved = await db(c, "rpc/health_save_kiosk_weight", {
      method: "POST",
      body: JSON.stringify({
        p_challenge_id: proof.challenge_id,
        p_device_id: proof.device_id,
        p_reading_id: proof.reading_id,
        p_card_hmac: lookupCard(proof.citizen_id, c.secret),
        p_citizen_id: proof.citizen_id,
        p_weight_hundredths: proof.weight_hundredths
      })
    });
    return reply(saved === true ? 200 : 403);
  } catch {
    return reply(503);
  }
}
