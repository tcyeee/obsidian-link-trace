declare module "ali-oss" {
  interface OSSListParams {
    prefix?: string;
    delimiter?: string;
    "max-keys"?: number;
    marker?: string;
  }

  interface OSSListResult {
    objects?: { name: string }[];
    prefixes?: string[];
    isTruncated?: boolean;
    nextMarker?: string;
  }

  interface OSSPutOptions {
    mime?: string;
  }

  interface OSSDeleteMultiOptions {
    quiet?: boolean;
  }

  interface OSSConfig {
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    authorizationV4?: boolean;
  }

  class OSS {
    constructor(config: OSSConfig);
    list(params: OSSListParams, options?: object): Promise<OSSListResult>;
    put(key: string, data: Buffer, options?: OSSPutOptions): Promise<void>;
    delete(key: string): Promise<void>;
    deleteMulti(keys: string[], options?: OSSDeleteMultiOptions): Promise<void>;
  }

  export = OSS;
}
