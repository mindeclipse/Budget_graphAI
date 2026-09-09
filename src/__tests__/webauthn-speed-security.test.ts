import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  sealChallengeToken,
  verifyChallengeToken,
  WebAuthnChallengeCredential,
} from "@/lib/session";

describe("WebAuthn Sealed Challenge Security & Speed", () => {
  const origSecret = process.env.APP_API_SECRET;
  const origPin = process.env.APP_ACCESS_PIN;

  beforeEach(() => {
    process.env.APP_API_SECRET =
      "super_secret_test_key_minimum_32_bytes_long_12345";
  });

  afterEach(() => {
    if (origSecret) process.env.APP_API_SECRET = origSecret;
    else delete process.env.APP_API_SECRET;
    if (origPin) process.env.APP_ACCESS_PIN = origPin;
    else delete process.env.APP_ACCESS_PIN;
  });

  const mockCredentials: WebAuthnChallengeCredential[] = [
    {
      id: "cred-apple-touchid-1",
      public_key: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtestpublickey12345",
      counter: 42,
      transports: ["internal"],
    },
    {
      id: "cred-macbook-faceid-2",
      public_key: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEanotherkey67890",
      counter: 105,
      transports: ["internal", "hybrid"],
    },
  ];

  it("successfully seals and verifies WebAuthn challenge with embedded credentials", async () => {
    const rawChallenge = "random_crypto_challenge_xyz_987";
    const sealedToken = await sealChallengeToken(
      rawChallenge,
      mockCredentials,
      300
    );

    expect(sealedToken).toContain(".");
    const [payloadB64, sigB64] = sealedToken.split(".");
    expect(payloadB64).toBeDefined();
    expect(sigB64).toBeDefined();

    const result = await verifyChallengeToken(sealedToken);
    expect(result.valid).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload?.challenge).toBe(rawChallenge);
    expect(result.payload?.credentials.length).toBe(2);
    expect(result.payload?.credentials[0].id).toBe("cred-apple-touchid-1");
    expect(result.payload?.credentials[0].counter).toBe(42);
    expect(result.payload?.credentials[1].id).toBe("cred-macbook-faceid-2");
  });

  it("rejects tampered challenge token when payload is altered", async () => {
    const rawChallenge = "legitimate_challenge_abc";
    const sealedToken = await sealChallengeToken(
      rawChallenge,
      mockCredentials,
      300
    );

    const [payloadB64, sigB64] = sealedToken.split(".");
    // Tamper with payload: replace a character
    const tamperedPayload =
      payloadB64.slice(0, -2) + (payloadB64.slice(-2) === "AA" ? "BB" : "AA");
    const tamperedToken = `${tamperedPayload}.${sigB64}`;

    const result = await verifyChallengeToken(tamperedToken);
    expect(result.valid).toBe(false);
    expect(result.payload).toBeUndefined();
  });

  it("rejects tampered challenge token when signature is altered", async () => {
    const rawChallenge = "legitimate_challenge_xyz";
    const sealedToken = await sealChallengeToken(
      rawChallenge,
      mockCredentials,
      300
    );

    const [payloadB64, sigB64] = sealedToken.split(".");
    // Tamper with signature
    const tamperedSig = sigB64.slice(0, -4) + "XXXX";
    const tamperedToken = `${payloadB64}.${tamperedSig}`;

    const result = await verifyChallengeToken(tamperedToken);
    expect(result.valid).toBe(false);
  });

  it("rejects expired challenge token", async () => {
    const rawChallenge = "expired_challenge";
    // TTL -1 seconds (already expired)
    const sealedToken = await sealChallengeToken(
      rawChallenge,
      mockCredentials,
      -1
    );

    const result = await verifyChallengeToken(sealedToken);
    expect(result.valid).toBe(false);
  });

  it("safely handles null, empty, or malformed tokens without throwing", async () => {
    expect((await verifyChallengeToken(null)).valid).toBe(false);
    expect((await verifyChallengeToken("")).valid).toBe(false);
    expect((await verifyChallengeToken("random-string-no-dot")).valid).toBe(
      false
    );
    expect((await verifyChallengeToken("not.valid.base64.json")).valid).toBe(
      false
    );
    expect((await verifyChallengeToken("a.b.c")).valid).toBe(false);
  });
});
