/**
 * Minimal ambient types for `mammoth`, which ships no TypeScript
 * declarations and has no published @types/mammoth package. Only the
 * surface actually used by this app (extractRawText) is typed; everything
 * else stays untyped rather than guessing at a broader API this app
 * doesn't call.
 */
declare module "mammoth" {
  export type MammothMessage = {
    type: string;
    message: string;
  };

  export type ExtractRawTextResult = {
    value: string;
    messages: MammothMessage[];
  };

  export function extractRawText(input: {
    buffer: Buffer;
  }): Promise<ExtractRawTextResult>;
}
