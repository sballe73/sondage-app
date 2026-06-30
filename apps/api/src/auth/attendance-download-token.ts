import { SignJWT, jwtVerify } from "jose";
import type { DataRegion } from "@sondage/shared";
import { config } from "../config.js";
import { AppError } from "../errors.js";

const encoder = new TextEncoder();
const secret = () => encoder.encode(config.jwtSecret);

const PURPOSE = "attendance-tsv";

export async function issueAttendanceTsvDownloadToken(
  pollId: string,
  creatorId: string,
  dataRegion: DataRegion
): Promise<string> {
  return new SignJWT({
    purpose: PURPOSE,
    pollId,
    region: dataRegion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(creatorId)
    .setIssuedAt()
    .setIssuer(config.jwtIssuer)
    .setAudience(config.jwtAudience)
    .setExpirationTime("2m")
    .sign(secret());
}

export async function verifyAttendanceTsvDownloadToken(
  token: string,
  pollId: string
): Promise<{ creatorId: string; dataRegion: DataRegion }> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });
    if (payload.purpose !== PURPOSE || payload.pollId !== pollId) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid download token");
    }
    const creatorId = payload.sub;
    if (!creatorId) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid download token");
    }
    return {
      creatorId,
      dataRegion: (payload.region as DataRegion) ?? config.defaultDataRegion,
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(401, "UNAUTHORIZED", "Invalid or expired download token");
  }
}
