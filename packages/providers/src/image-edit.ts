import { assertEligibleForChildPhotos, type ProviderCard } from './shared';

export interface ImageEditInput {
  source: string;
  reference?: string | undefined;
  mask: string;
  instruction: string;
}
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
/** This model has no unpaid API tier. Do not add a free-tier fallback for child photos. */
export const imageEditProviderCard: ProviderCard = {
  dataPolicy: {
    verifiedAt: '2026-10-06', policyVersion: 'gemini-paid-image-2026-10-06', childDataSent: true,
    childDataScope: ['illustration pixels', 'optional identity reference', 'selection mask', 'edit instruction'],
    retentionMode: 'FIXED_TERM', trainingUse: 'PROHIBITED', deletionMechanism: 'AUTOMATIC_EXPIRY',
    region: 'Google-managed; no regional residency guarantee',
    evidenceRef: 'https://ai.google.dev/gemini-api/terms#paid-services; https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-image',
  },
  idempotency: 'Application reserves a unique request ID; never retry a provider call automatically.',
  timeoutMs: 180_000, retryPolicy: 'No automatic retries.', costMetadata: 'Gemini usageMetadata; billing through the API key project.',
};
export function imageEditPrompt(instruction: string): string {
  return `Edit the FIRST image, a children's storybook illustration. The LAST image is an edit mask: opaque black pixels are protected; white pixels mark the selected area. Change only that area. Return the complete first image with the same framing and aspect ratio, not a crop. Preserve composition, body, clothing, other characters and art style. If there are three images, the SECOND is an identity reference: preserve the child's facial proportions, age, skin tone, hairline and expression with restrained painterly treatment. Never paste the reference photograph into the illustration. Parent's requested correction: ${instruction}`;
}
function inlineData(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid image data');
  return { inlineData: { mimeType: match[1]!, data: match[2]! } };
}
export class GeminiImageEditProvider {
  readonly card = imageEditProviderCard;
  constructor(private readonly apiKey: string) { if (!apiKey) throw new Error('Gemini image editing is not configured'); }
  async edit(input: ImageEditInput): Promise<{ bytes: Uint8Array; mediaType: string }> {
    assertEligibleForChildPhotos(this.card.dataPolicy);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      signal: AbortSignal.timeout(this.card.timeoutMs),
      body: JSON.stringify({ contents: [{ parts: [{ text: imageEditPrompt(input.instruction) }, inlineData(input.source), ...(input.reference ? [inlineData(input.reference)] : []), inlineData(input.mask)] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
    });
    if (!response.ok) throw new Error(`Gemini image request failed (${response.status})`);
    const result = await response.json() as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string }; thought?: boolean }[] } }[] };
    const image = result.candidates?.[0]?.content?.parts?.find((part) => !part.thought && part.inlineData?.mimeType?.startsWith('image/'))?.inlineData;
    if (!image?.data || !image.mimeType || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) throw new Error('Gemini did not return an image');
    return { bytes: new Uint8Array(Buffer.from(image.data, 'base64')), mediaType: image.mimeType };
  }
}
