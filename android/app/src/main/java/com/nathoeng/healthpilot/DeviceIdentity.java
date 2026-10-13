package com.nathoeng.healthpilot;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.UUID;
/** Android Keystore P-256 signing key: private key remains inside device. */
public final class DeviceIdentity {
  private static final String KEY_ALIAS="nathoeng_health_kiosk_p256_v1";
  private DeviceIdentity(){}
  private static KeyStore store()throws Exception{KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);return ks;}
  private static synchronized void ensureKey()throws Exception{
    if(store().containsAlias(KEY_ALIAS))return;
    KeyPairGenerator g=KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore");
    KeyGenParameterSpec spec=new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256).setUserAuthenticationRequired(false).build();
    g.initialize(spec);g.generateKeyPair();
  }
  public static String publicKeyBase64()throws Exception{
    ensureKey();return Base64.getEncoder().encodeToString(store().getCertificate(KEY_ALIAS).getPublicKey().getEncoded());
  }
  /** A separate signature domain for the actual card ID just re-read from the chip.
   * Never display, persist or log the ID; it is sent only to the Health server via TLS.
   */
  public static String signCardPresence(String deviceId,String challengeId,String citizenId)throws Exception{
    ensureKey();UUID.fromString(deviceId);UUID.fromString(challengeId);
    if(citizenId==null||!citizenId.matches("[0-9]{13}"))throw new IllegalArgumentException("Invalid chip");
    String value="nathoeng-health-card-presence-v1:"+deviceId+":"+challengeId+":"+citizenId;
    Signature s=Signature.getInstance("SHA256withECDSA");
    s.initSign((PrivateKey)store().getKey(KEY_ALIAS,null));
    s.update(value.getBytes(StandardCharsets.UTF_8));
    return Base64.getEncoder().encodeToString(s.sign());
  }
  public static String signChallenge(String deviceId,String challengeId)throws Exception{
    ensureKey();UUID.fromString(deviceId);UUID.fromString(challengeId);
    String text="nathoeng-health-kiosk-v1:"+deviceId+":"+challengeId;
    Signature s=Signature.getInstance("SHA256withECDSA");
    s.initSign((PrivateKey)store().getKey(KEY_ALIAS,null));
    s.update(text.getBytes(StandardCharsets.UTF_8));
    return Base64.getEncoder().encodeToString(s.sign());
  }
}
