import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { ClothingFitHint, ClothingLengthHint, ClothingView } from "../types";

const fileToGenerativePart = (base64: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64.split(',')[1],
      mimeType,
    },
  };
};

const getApiKeyOrThrow = (apiKey?: string): string => {
  if (!apiKey?.trim()) {
    throw new Error("Введите Gemini API key.");
  }
  return apiKey.trim();
};

type OutputAspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

const ASPECT_RATIO_CANDIDATES: Array<{ label: OutputAspectRatio; value: number }> = [
  { label: '1:1', value: 1 },
  { label: '3:4', value: 3 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '9:16', value: 9 / 16 },
  { label: '16:9', value: 16 / 9 },
];

const loadImageDimensionsFromDataUrl = (
  dataUrl: string
): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error('Не удалось прочитать размеры изображения.'));
    image.src = dataUrl;
  });

const getClosestAspectRatio = (width: number, height: number): OutputAspectRatio => {
  if (!width || !height) return '3:4';
  const ratio = width / height;

  let best = ASPECT_RATIO_CANDIDATES[0];
  let bestDiff = Math.abs(ratio - best.value);

  for (const candidate of ASPECT_RATIO_CANDIDATES) {
    const diff = Math.abs(ratio - candidate.value);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }

  return best.label;
};

const VALIDATION_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

const isModelNotFoundError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('is not found') || message.includes('not_found');
};

const generateWithFallback = async (
  ai: GoogleGenAI,
  requestFactory: (model: string) => Parameters<typeof ai.models.generateContent>[0]
) => {
  let lastError: unknown = null;

  for (const model of VALIDATION_MODELS) {
    try {
      return await ai.models.generateContent(requestFactory(model));
    } catch (error) {
      lastError = error;
      if (!isModelNotFoundError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Не удалось выбрать доступную модель проверки.');
};

export const validateUserImage = async (
  base64Image: string,
  mimeType: string,
  apiKey?: string
): Promise<{ isValid: boolean; message?: string }> => {
  const ai = new GoogleGenAI({ apiKey: getApiKeyOrThrow(apiKey) });
  const imagePart = fileToGenerativePart(base64Image, mimeType);

  const prompt = `
    Analyze this image strictly for a Virtual Try-On application.
    
    Criteria for VALID image:
    1. Contains a real human person.
    2. The person is visible in FULL BODY or at least from KNEES up.
    3. The pose is relatively straight/neutral, suitable for dressing.
    
    Criteria for INVALID image:
    1. Only a face or headshot.
    2. Only a torso/bust (not enough body to see the outfit fit).
    3. Objects, animals, landscapes, or mannequins without a real human.
    4. Extreme cropping where arms or legs are completely cut off in a way that makes try-on impossible.

    Return JSON with 'isValid' (boolean) and 'message' (string, localizable to Russian, explaining why if invalid).
  `;

  try {
    const response = await generateWithFallback(ai, (model) => ({
      model,
      contents: {
        parts: [imagePart, { text: prompt }],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isValid: { type: Type.BOOLEAN },
            message: { type: Type.STRING },
          },
          required: ["isValid", "message"],
        },
      },
    }));

    if (response.text) {
      return JSON.parse(response.text);
    }
    return { isValid: false, message: "Не удалось проверить изображение." };
  } catch (error) {
    console.error("Validation error:", error);
    throw new Error("Не удалось проверить изображение. Проверьте API key и повторите.");
  }
};

export type UserPose = ClothingView | 'unknown';

export interface UserPhotoAnalysis {
  isValid: boolean;
  message?: string;
  pose: UserPose;
  bodyCoverage: 'full' | 'two_thirds' | 'portrait' | 'unknown';
}

export type TryOnModelMode = 'pro' | 'flash';
export type TryOnGenerationStage = 'fit' | 'outpaint_bottom';

const buildTryOnPrompt = (
  fitContext?: {
    userPose?: UserPose;
    clothingView?: ClothingView;
    bodyCoverage?: string;
    clothingName?: string;
    clothingFitHint?: ClothingFitHint;
    clothingLengthHint?: ClothingLengthHint;
    designNotes?: string;
    isLongGarment?: boolean;
    forceTallCanvas?: boolean;
    generationStage?: TryOnGenerationStage;
  }
): string => {
  const stage = fitContext?.generationStage || 'fit';

  if (stage === 'outpaint_bottom') {
    return `
Task: Anchored bottom outpaint for a virtual try-on result.

Image A: target person image that is already dressed and anchored at top, with extra space below.
Image B: clothing reference (garment design only).

Context:
- user pose: ${fitContext?.userPose || 'unknown'}
- clothing view: ${fitContext?.clothingView || 'unknown'}
- clothing name: ${fitContext?.clothingName || 'unknown'}
- clothing fit: ${fitContext?.clothingFitHint || 'unknown'}
- clothing length: ${fitContext?.clothingLengthHint || 'unknown'}
- design notes: ${fitContext?.designNotes || 'none'}

Hard rules:
1) Keep exactly one person: the same person from Image A.
2) Preserve identity, face, hair, shoulders, torso, arm thickness, pose, and camera geometry from Image A.
   Face is immutable: do not alter facial shape, eyes, nose, lips, skin tone, expression.
3) Keep upper body and original framed area unchanged; do not redraw the whole image.
4) Do not copy body shape, pose, face, shoes, accessories, or background from Image B.
5) Extend only the lower garment continuation into the added bottom area.
6) Preserve garment material, cut, hem, asymmetry/slit/wrap details from Image B.
   Existing garment pixels already visible in Image A are immutable; only continue them below.
7) Do not horizontally stretch or slim the person.
8) Output must look like a natural continuation of Image A, not a new composition.
9) Preserve garment length class precisely:
   - short: above knee
   - midi: below knee
   - maxi: around ankle, MUST NOT touch ground
   - floor: near floor
10) Never re-design garment silhouette during outpaint: no new flare, no extra train, no hem widening.
`;
  }

  return `
Task: High-accuracy virtual try-on.

Image A: target person (identity and body geometry source).
Image B: clothing reference (garment source only).

Context:
- user pose: ${fitContext?.userPose || 'unknown'}
- clothing view: ${fitContext?.clothingView || 'unknown'}
- body coverage: ${fitContext?.bodyCoverage || 'unknown'}
- clothing name: ${fitContext?.clothingName || 'unknown'}
- clothing fit: ${fitContext?.clothingFitHint || 'unknown'}
- clothing length: ${fitContext?.clothingLengthHint || 'unknown'}
- design notes: ${fitContext?.designNotes || 'none'}
- long garment mode: ${fitContext?.isLongGarment ? 'on' : 'off'}

Hard rules:
1) Exactly one person in output: the same person from Image A.
2) Preserve identity, face, hair, shoulders, chest, torso, arms, hips, and overall proportions from Image A.
   Face is immutable: do not alter facial shape, eyes, nose, lips, skin tone, expression.
3) Preserve pose, perspective, and background from Image A.
4) Do not copy model identity/body/pose/background from Image B.
5) Transfer only the garment from Image B: material, cut, fit, seams, silhouette, hem, asymmetry/slit/wrap.
   Garment geometry is immutable: preserve structure and proportions of pattern pieces and silhouette.
6) Keep body width and scale from Image A. No slimming, no widening, no horizontal stretch.
7) For long garments, preserve true length and hem geometry; do not shorten to fit frame.
8) If hem is out of frame, keep person proportions fixed and prioritize natural garment continuation.
9) Preserve garment length class precisely:
   - short: above knee
   - midi: below knee
   - maxi: around ankle, MUST NOT touch ground
   - floor: near floor
10) Do not invent extra flare/train/volume. Keep hem width and drape close to reference.
11) If more space is needed, expand environment and continue legs/body naturally; do NOT resize or reshape the garment itself.
`;
};

export const analyzeUserPhoto = async (
  base64Image: string,
  mimeType: string,
  apiKey?: string
): Promise<UserPhotoAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: getApiKeyOrThrow(apiKey) });
  const imagePart = fileToGenerativePart(base64Image, mimeType);

  const prompt = `
    Analyze user photo for virtual try-on.

    Return strict JSON with fields:
    - isValid: boolean
    - message: string in Russian
    - pose: one of ["front","side","three_quarter","unknown"]
    - bodyCoverage: one of ["full","two_thirds","portrait","unknown"]

    Validation rules:
    1) Valid only if a real human is present.
    2) Valid only if body is at least from knees up ("two_thirds") or full.
    3) Invalid for random objects, animals, empty scenes, mannequins.
    4) Invalid for close portrait/head-only shots.

    Pose guidance:
    - "front": torso mostly facing camera.
    - "side": strong side profile / body turned ~70-110 degrees.
    - "three_quarter": between front and side.
    - "unknown": unclear.
  `;

  const response = await generateWithFallback(ai, (model) => ({
    model,
    contents: {
      parts: [imagePart, { text: prompt }],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isValid: { type: Type.BOOLEAN },
          message: { type: Type.STRING },
          pose: { type: Type.STRING, enum: ['front', 'side', 'three_quarter', 'unknown'] },
          bodyCoverage: { type: Type.STRING, enum: ['full', 'two_thirds', 'portrait', 'unknown'] },
        },
        required: ["isValid", "message", "pose", "bodyCoverage"],
      },
    },
  }));

  if (response.text) {
    return JSON.parse(response.text);
  }

  return {
    isValid: false,
    message: "Не удалось проанализировать фото.",
    pose: 'unknown',
    bodyCoverage: 'unknown',
  };
};

export const generateVirtualTryOnImage = async (
  personImage: { base64: string; mimeType: string },
  clothingImage: { base64: string; mimeType: string },
  apiKey?: string,
  modelMode: TryOnModelMode = 'pro',
  fitContext?: {
    userPose?: UserPose;
    clothingView?: ClothingView;
    bodyCoverage?: string;
    clothingName?: string;
    clothingFitHint?: ClothingFitHint;
    clothingLengthHint?: ClothingLengthHint;
    designNotes?: string;
    isLongGarment?: boolean;
    forceTallCanvas?: boolean;
    generationStage?: TryOnGenerationStage;
  }
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKeyOrThrow(apiKey) });
  
  const personImagePart = fileToGenerativePart(personImage.base64, personImage.mimeType);
  const clothingImagePart = fileToGenerativePart(clothingImage.base64, clothingImage.mimeType);
  let outputAspectRatio: OutputAspectRatio = '3:4';
  try {
    const personDimensions = await loadImageDimensionsFromDataUrl(personImage.base64);
    outputAspectRatio = getClosestAspectRatio(personDimensions.width, personDimensions.height);
  } catch {
    outputAspectRatio = '3:4';
  }
  if (fitContext?.forceTallCanvas) {
    outputAspectRatio = '9:16';
  }

  const prompt = buildTryOnPrompt(fitContext);

  const modelByMode: Record<TryOnModelMode, string> = {
    pro: 'gemini-3-pro-image-preview',
    flash: 'gemini-2.5-flash-image',
  };

  const response = await ai.models.generateContent({
    model: modelByMode[modelMode],
    contents: {
      parts: [
        { text: 'Image A (TARGET PERSON): keep this person identity, body, pose, and scene.' },
        personImagePart,
        { text: 'Image B (CLOTHING REFERENCE): use only garment design and material from this image.' },
        clothingImagePart,
        { text: prompt },
      ],
    },
    config: {
      responseModalities: [Modality.IMAGE],
      imageConfig: {
          imageSize: "1K",
          aspectRatio: outputAspectRatio,
      }
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const base64ImageBytes = part.inlineData.data;
      const generatedMimeType = part.inlineData.mimeType || 'image/png';
      return `data:${generatedMimeType};base64,${base64ImageBytes}`;
    }
  }
  
  throw new Error("No image was generated. The AI may have refused the request.");
};
