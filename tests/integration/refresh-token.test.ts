/**
 * Refresh-token family reuse detection against a live MySQL.
 * Skipped unless DB_INTEGRATION=1.
 */
import { describe, expect, it } from "vitest";
import {
  createUser,
  findActiveRefreshToken,
  findRefreshTokenByHash,
  issueRefreshToken,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
} from "../../server/utils/db";
import { deleteUserAccount } from "../../server/services/auth/accountDeletionService";
import { hashOpaqueToken, nowPlusSeconds } from "../../server/utils/auth";
import {
  assertIntegrationDbReady,
  integrationEnabled,
  useIntegrationPoolTeardown,
} from "./helpers";

describe.skipIf(!integrationEnabled)(
  "integration: refresh token family",
  () => {
    useIntegrationPoolTeardown();

    it("reuse of a revoked hash revokes the family", async () => {
      await assertIntegrationDbReady();
      const user = await createUser({
        email: `it-rt-${Date.now()}@example.test`,
        passwordHash: null,
        name: "IT Refresh",
        emailVerified: true,
      });
      try {
        const raw1 = `raw-1-${Date.now()}`;
        const hash1 = hashOpaqueToken(raw1);
        const { familyId } = await issueRefreshToken({
          userId: user.id,
          tokenHash: hash1,
          expiresAt: nowPlusSeconds(3600),
        });

        const raw2 = `raw-2-${Date.now()}`;
        const hash2 = hashOpaqueToken(raw2);
        const rotated = await rotateRefreshToken({
          presentedHash: hash1,
          familyId,
          next: {
            userId: user.id,
            tokenHash: hash2,
            expiresAt: nowPlusSeconds(3600),
          },
        });
        expect(rotated).toBe(true);

        const prior = await findRefreshTokenByHash(hash1);
        expect(prior?.revokedAt).toBeTruthy();

        // Theft: present the old hash again → revoke family.
        await revokeRefreshTokenFamily(familyId);
        expect(await findActiveRefreshToken(hash2)).toBeNull();
      } finally {
        await deleteUserAccount(user.id);
      }
    });
  },
);
