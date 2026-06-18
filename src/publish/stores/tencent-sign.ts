import * as crypto from "crypto";

/** RFC3986 encoding: encodeURIComponent plus the sub-delims it leaves alone. */
export function camSafeUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

export interface CosSignInput {
  method: string;
  /** Raw object path with leading slash, NOT url-encoded. */
  pathname: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  secretId: string;
  secretKey: string;
  /** Signature validity window, Unix seconds. */
  startTime: number;
  endTime: number;
}

/** Build the COS `Authorization` header value (q-sign-algorithm=sha1 form). */
export function buildCosAuthorization(input: CosSignInput): string {
  const { method, pathname, query = {}, headers = {}, secretId, secretKey, startTime, endTime } = input;

  const hmacSha1 = (key: string, data: string) =>
    crypto.createHmac("sha1", key).update(data).digest("hex");
  const sha1 = (data: string) => crypto.createHash("sha1").update(data).digest("hex");

  // Lowercase keys, sort ascending; produce both the ;-joined key list and the
  // &-joined key=encodedValue string.
  const obj2parts = (obj: Record<string, string>) => {
    const lower: Record<string, string> = {};
    for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
    const keys = Object.keys(lower).sort();
    const list = keys.join(";");
    const str = keys
      .map((k) => `${camSafeUrlEncode(k)}=${camSafeUrlEncode(lower[k])}`)
      .join("&");
    return { list, str };
  };

  const keyTime = `${startTime};${endTime}`;
  const signKey = hmacSha1(secretKey, keyTime);

  const headerParts = obj2parts(headers);
  const paramParts = obj2parts(query);

  const httpString = `${method.toLowerCase()}\n${pathname}\n${paramParts.str}\n${headerParts.str}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerParts.list}`,
    `q-url-param-list=${paramParts.list}`,
    `q-signature=${signature}`,
  ].join("&");
}
