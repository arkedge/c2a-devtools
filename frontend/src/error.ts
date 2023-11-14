export class FriendlyError extends Error {
  public details?: string;
  public cause?: Error;
  constructor(message: string, options?: { details?: string; cause?: Error }) {
    super(message, { cause: options?.cause });
    this.name = "FriendlyError";
    this.details = options?.details;
  }
}
