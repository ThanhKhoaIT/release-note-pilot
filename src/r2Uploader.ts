import { AwsClient } from "aws4fetch";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public base URL for the bucket (e.g. an r2.dev dev URL or a custom domain), no trailing slash. */
  publicBaseUrl: string;
}

/** Uploads objects to a Cloudflare R2 bucket via its S3-compatible API. */
export class R2Uploader {
  private readonly client: AwsClient;
  private readonly endpoint: string;

  constructor(private readonly config: R2Config) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    this.endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
  }

  /** Uploads `body` under `key` and returns its public URL. */
  async upload(key: string, body: ArrayBuffer, contentType: string): Promise<string> {
    const response = await this.client.fetch(`${this.endpoint}/${key}`, {
      method: "PUT",
      body,
      headers: { "Content-Type": contentType },
    });

    if (!response.ok) {
      throw new Error(`R2 upload failed: ${response.status} ${await response.text()}`);
    }

    return `${this.config.publicBaseUrl}/${key}`;
  }
}
