import type { ClothingView } from '../types';

const DEFAULT_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const DEFAULT_MODEL_ID = 'doubao-seedream-4-0-250828';

const getApiKeyOrThrow = (apiKey?: string): string => {
  if (!apiKey?.trim()) {
    throw new Error('Введите Seedream API key.');
  }
  return apiKey.trim();
};

const normalizeBaseUrl = (baseUrl?: string): string => {
  const url = (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return url || DEFAULT_BASE_URL;
};

const buildTryOnPrompt = (fitContext?: {
  userPose?: 'front' | 'side' | 'three_quarter' | 'unknown';
  clothingView?: ClothingView;
  bodyCoverage?: string;
  clothingName?: string;
}): string => `
Task: Virtual fashion try-on.

Image mapping:
- Image 1: clothing reference.
- Image 2: person photo.

FIT CONTEXT:
- user pose: ${fitContext?.userPose || 'unknown'}
- selected clothing reference view: ${fitContext?.clothingView || 'unknown'}
- body coverage quality: ${fitContext?.bodyCoverage || 'unknown'}
- selected clothing name: ${fitContext?.clothingName || 'unknown'}

Goal:
Make the person from Image 2 wear the clothing from Image 1.

Hard constraints:
1) Preserve body geometry from Image 2 exactly.
2) Keep framing and perspective of Image 2.
3) Preserve garment cut/length/details from Image 1.
4) Keep background, face, hair, hands, legs and shoes from Image 2 unchanged.
5) Keep natural lighting and shadows from Image 2.
`;

interface SeedreamGenerateParams {
  personImage: { base64: string; mimeType: string };
  clothingImage: { base64: string; mimeType: string };
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  fitContext?: {
    userPose?: 'front' | 'side' | 'three_quarter' | 'unknown';
    clothingView?: ClothingView;
    bodyCoverage?: string;
    clothingName?: string;
  };
}

export const generateSeedreamTryOnImage = async ({
  personImage,
  clothingImage,
  apiKey,
  baseUrl,
  modelId = DEFAULT_MODEL_ID,
  fitContext,
}: SeedreamGenerateParams): Promise<string> => {
  const key = getApiKeyOrThrow(apiKey);
  const endpoint = `${normalizeBaseUrl(baseUrl)}/images/generations`;
  const prompt = buildTryOnPrompt(fitContext);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: modelId,
      prompt,
      image: [clothingImage.base64, personImage.base64],
      size: '1024x1024',
      response_format: 'url',
      watermark: false,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message =
      data?.error?.message || data?.message || data?.code || 'Seedream request failed.';
    throw new Error(`Seedream: ${message}`);
  }

  const url = data?.data?.[0]?.url;
  if (typeof url === 'string' && url.length > 0) {
    return url;
  }

  const b64 = data?.data?.[0]?.b64_json;
  if (typeof b64 === 'string' && b64.length > 0) {
    return `data:image/png;base64,${b64}`;
  }

  throw new Error('Seedream: не удалось получить изображение.');
};

export const SEEDREAM_DEFAULTS = {
  baseUrl: DEFAULT_BASE_URL,
  modelId: DEFAULT_MODEL_ID,
};
