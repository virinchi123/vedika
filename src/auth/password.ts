import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const algorithm = "scrypt";
const version = "v1";
const keyLength = 64;
type ScryptParameters = {
  N: number;
  r: number;
  p: number;
};

const scryptParameters: ScryptParameters = {
  N: 16_384,
  r: 8,
  p: 1,
};

const deriveKey = async (password: string, salt: string, parameters: ScryptParameters): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, parameters, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await deriveKey(password, salt, scryptParameters);

  return [
    algorithm,
    version,
    scryptParameters.N,
    scryptParameters.r,
    scryptParameters.p,
    salt,
    derivedKey.toString("base64url"),
  ].join("$");
};

export const verifyPassword = async (password: string, serializedHash: string): Promise<boolean> => {
  const [serializedAlgorithm, serializedVersion, rawN, rawR, rawP, salt, rawHash] = serializedHash.split("$");

  if (
    serializedAlgorithm !== algorithm ||
    serializedVersion !== version ||
    !rawN ||
    !rawR ||
    !rawP ||
    !salt ||
    !rawHash
  ) {
    return false;
  }

  const parameters = {
    N: Number.parseInt(rawN, 10),
    r: Number.parseInt(rawR, 10),
    p: Number.parseInt(rawP, 10),
  };

  if (!Number.isInteger(parameters.N) || !Number.isInteger(parameters.r) || !Number.isInteger(parameters.p)) {
    return false;
  }

  const expectedHash = Buffer.from(rawHash, "base64url");
  const derivedKey = await deriveKey(password, salt, parameters);

  if (expectedHash.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(expectedHash, derivedKey);
};
