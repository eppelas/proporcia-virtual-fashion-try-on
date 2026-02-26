import type { ClothingView } from '../types';

export type QwenRegion = 'intl' | 'cn';

const getQwenEndpoint = (region: QwenRegion): string => {
  if (region === 'cn') {
    return 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  }
  return 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
};

const getApiKeyOrThrow = (apiKey?: string): string => {
  if (!apiKey?.trim()) {
    throw new Error('Введите Qwen API key.');
  }
  return apiKey.trim();
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
1) Preserve body geometry from Image 2 exactly (shoulders, chest, arms, waist, hips, legs).
2) Do not slim, widen, or reshape the person.
3) Keep camera perspective and framing of Image 2.
4) Preserve clothing design from Image 1: cut, silhouette, texture, hems, slits, wrap overlaps, seams, details.
5) Preserve long-garment length category (mini/midi/maxi/floor). Do not shorten long garments.
6) Keep face, hair, hands, legs, shoes, and background from Image 2 unchanged.
7) Keep lighting and shadows consistent with Image 2.

Output:
Photorealistic edited image where Image 2 person wears Image 1 clothing naturally.
`;

interface QwenGenerateParams {
  personImage: { base64: string; mimeType: string };
  clothingImage: { base64: string; mimeType: string };
  apiKey?: string;
  region?: QwenRegion;
  fitContext?: {
    userPose?: 'front' | 'side' | 'three_quarter' | 'unknown';
    clothingView?: ClothingView;
    bodyCoverage?: string;
    clothingName?: string;
  };
}

export const generateQwenTryOnImage = async ({
  personImage,
  clothingImage,
  apiKey,
  region = 'intl',
  fitContext,
}: QwenGenerateParams): Promise<string> => {
  const key = getApiKeyOrThrow(apiKey);
  const endpoint = getQwenEndpoint(region);
  const prompt = buildTryOnPrompt(fitContext);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'qwen-image-edit-plus',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: clothingImage.base64 },
              { image: personImage.base64 },
              { text: prompt },
            ],
          },
        ],
      },
      parameters: {
        n: 1,
        prompt_extend: false,
        watermark: false,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message =
      data?.message || data?.error?.message || data?.code || 'Qwen request failed.';
    throw new Error(`Qwen: ${message}`);
  }

  const imageUrl =
    data?.output?.choices?.[0]?.message?.content?.find(
      (item: { image?: string }) => typeof item.image === 'string'
    )?.image || null;

  if (!imageUrl) {
    throw new Error('Qwen: не удалось получить ссылку на изображение.');
  }

  return imageUrl;
};
