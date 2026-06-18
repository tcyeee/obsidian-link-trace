import { describe, it, expect } from "vitest";
import { buildCosAuthorization, camSafeUrlEncode } from "./tencent-sign";

const SECRET_ID = "AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q";
const SECRET_KEY = "BQYIM75p8x0iWVFSIgqEKwFprpRSVHlz";

describe("camSafeUrlEncode", () => {
  it("encodes RFC3986 sub-delims that encodeURIComponent leaves alone", () => {
    expect(camSafeUrlEncode("a!'()*b")).toBe("a%21%27%28%29%2Ab");
    expect(camSafeUrlEncode("text/plain")).toBe("text%2Fplain");
    expect(camSafeUrlEncode('uin="100000000011"')).toBe("uin%3D%22100000000011%22");
  });
});

describe("buildCosAuthorization", () => {
  it("matches the official PUT example", () => {
    const auth = buildCosAuthorization({
      method: "PUT",
      pathname: "/exampleobject(腾讯云)",
      query: {},
      headers: {
        "content-length": "13",
        "content-md5": "mQ/fVh815F3k6TAUm8m0eg==",
        "content-type": "text/plain",
        date: "Thu, 16 May 2019 06:45:51 GMT",
        host: "examplebucket-1250000000.cos.ap-beijing.myqcloud.com",
        "x-cos-acl": "private",
        "x-cos-grant-read": 'uin="100000000011"',
      },
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
      startTime: 1557989151,
      endTime: 1557996351,
    });
    expect(auth).toBe(
      "q-sign-algorithm=sha1&q-ak=AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q" +
        "&q-sign-time=1557989151;1557996351&q-key-time=1557989151;1557996351" +
        "&q-header-list=content-length;content-md5;content-type;date;host;x-cos-acl;x-cos-grant-read" +
        "&q-url-param-list=&q-signature=3b8851a11a569213c17ba8fa7dcf2abec6935172"
    );
  });

  it("matches the official GET example (with query params)", () => {
    const auth = buildCosAuthorization({
      method: "get",
      pathname: "/exampleobject(腾讯云)",
      query: {
        "response-content-type": "application/octet-stream",
        "response-cache-control": "max-age=600",
      },
      headers: {
        date: "Thu, 16 May 2019 06:55:53 GMT",
        host: "examplebucket-1250000000.cos.ap-beijing.myqcloud.com",
      },
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
      startTime: 1557989753,
      endTime: 1557996953,
    });
    expect(auth).toBe(
      "q-sign-algorithm=sha1&q-ak=AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q" +
        "&q-sign-time=1557989753;1557996953&q-key-time=1557989753;1557996953" +
        "&q-header-list=date;host&q-url-param-list=response-cache-control;response-content-type" +
        "&q-signature=01681b8c9d798a678e43b685a9f1bba0f6c0e012"
    );
  });
});
