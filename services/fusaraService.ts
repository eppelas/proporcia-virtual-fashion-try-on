import type { ClothingFitHint, ClothingLengthHint, ClothingView } from '../types';

export type FusaraModifyModel = 'qwen' | 'seedream';

const BASE_URL = 'https://api.fusara.ai';
const GENERATE_URL = `${BASE_URL}/api/integration/imaging/generate`;
const TASKS_URL = `${BASE_URL}/api/integration/imaging/tasks`;
const TMPFILES_UPLOAD_URL = 'https://tmpfiles.org/api/v1/upload';

const MODEL_TYPES_MODIFY: Record<FusaraModifyModel, number> = {
  qwen: 24, // QwenEdit
  seedream: 23, // Seededit
};

const MODEL_TYPES_PRESET_FALLBACK: Record<FusaraModifyModel, number> = {
  qwen: 21, // QwenCreate
  seedream: 22, // Seedream
};

const MODEL_DEFAULTS_MODIFY: Record<FusaraModifyModel, Record<string, string | number>> = {
  qwen: {},
  seedream: {},
};

const MODEL_DEFAULTS_PRESET_FALLBACK: Record<FusaraModifyModel, Record<string, string | number>> = {
  qwen: {
    NumberOfInferenceSteps: 40,
    GuidanceScale: 4.0,
  },
  seedream: {},
};

type FusaraImageInput = { base64: string; mimeType: string };
type JsonLike = Record<string, unknown> | null;
type FusaraAspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

const ASPECT_RATIO_CANDIDATES: Array<{ label: FusaraAspectRatio; value: number }> = [
  { label: '1:1', value: 1 },
  { label: '3:4', value: 3 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '9:16', value: 9 / 16 },
  { label: '16:9', value: 16 / 9 },
];

const uploadedImageCache = new Map<string, string>();

const getApiKeyOrThrow = (apiKey?: string): string => {
  if (!apiKey?.trim()) {
    throw new Error('Введите Fusara API key.');
  }
  return apiKey.trim();
};

const buildImageCacheKey = (image: FusaraImageInput): string => {
  const head = image.base64.slice(0, 64);
  const tail = image.base64.slice(-64);
  return `${image.mimeType}:${image.base64.length}:${head}:${tail}`;
};

const loadImageDimensionsFromDataUrl = (
  dataUrl: string
): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    image.onerror = () => reject(new Error('Не удалось прочитать размеры изображения.'));
    image.src = dataUrl;
  });

const getClosestAspectRatio = (width: number, height: number): FusaraAspectRatio => {
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

const dimensionsByAspectRatio = (
  aspectRatio: FusaraAspectRatio
): { width: number; height: number; size: string } => {
  switch (aspectRatio) {
    case '9:16':
      return { width: 576, height: 1024, size: '576x1024' };
    case '3:4':
      return { width: 768, height: 1024, size: '768x1024' };
    case '4:3':
      return { width: 1024, height: 768, size: '1024x768' };
    case '16:9':
      return { width: 1024, height: 576, size: '1024x576' };
    case '1:1':
    default:
      return { width: 1024, height: 1024, size: '1024x1024' };
  }
};

const mimeToExtension = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('heic')) return 'heic';
  if (normalized.includes('heif')) return 'heif';
  return 'jpg';
};

const toDirectTmpfilesUrl = (url: string): string => {
  const secure = url.replace(/^http:\/\//i, 'https://');
  if (secure.includes('/dl/')) return secure;
  return secure.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
};

const parseJsonSafe = async (response: Response): Promise<JsonLike> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
};

const isHtmlLike = (value: string): boolean => {
  const normalized = value.toLowerCase();
  return normalized.includes('<!doctype html') || normalized.includes('<html');
};

const sanitizeErrorText = (value: string): string => {
  if (isHtmlLike(value)) {
    return 'Internal Server Error (HTML response from Fusara)';
  }
  return value.length > 260 ? `${value.slice(0, 260)}...` : value;
};

const extractErrorMessage = (payload: JsonLike, fallback: string): string => {
  if (!payload) return fallback;
  const errorObj = payload.error as Record<string, unknown> | undefined;
  const dataObj = payload.data as Record<string, unknown> | undefined;
  const raw = payload.raw;

  if (typeof raw === 'string' && /<!DOCTYPE html>/i.test(raw)) {
    return 'Internal Server Error (HTML response from Fusara)';
  }

  const messageCandidate =
    (typeof errorObj?.description === 'string' && errorObj.description) ||
    (typeof errorObj?.message === 'string' && errorObj.message) ||
    (typeof payload.message === 'string' && payload.message) ||
    (typeof dataObj?.message === 'string' && dataObj.message) ||
    (typeof raw === 'string' && raw.slice(0, 240));

  if (typeof messageCandidate === 'string' && messageCandidate.length > 0) {
    return sanitizeErrorText(messageCandidate);
  }
  return fallback;
};

const isTransientGenerateFailure = (error: Error & { status?: number; reason?: string }): boolean => {
  const message = error.message.toLowerCase();
  if (error.reason === 'missing_task_id') return true;
  if (typeof error.status === 'number') {
    return error.status === 429 || error.status === 500 || error.status === 502 || error.status === 503 || error.status === 504;
  }
  return (
    message.includes('internal server error') ||
    message.includes('timeout') ||
    message.includes('temporarily') ||
    message.includes('<!doctype html>')
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
  }
  return '';
};

const extractTaskId = (payload: JsonLike): string => {
  if (!payload) return '';

  const dataObj = payload.data as Record<string, unknown> | undefined;
  const taskObj = payload.task as Record<string, unknown> | undefined;
  const dataTaskObj = dataObj?.task as Record<string, unknown> | undefined;
  const rootResults = payload.results as Array<Record<string, unknown>> | undefined;
  const dataResults = dataObj?.results as Array<Record<string, unknown>> | undefined;
  const dataArray = Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : undefined;

  const dataValue = payload.data;
  const dataStringCandidate =
    typeof dataValue === 'string' && dataValue.length > 4 && !/^https?:\/\//i.test(dataValue)
      ? dataValue
      : '';

  return firstString(
    payload.taskId,
    (payload as Record<string, unknown>).taskID,
    payload.id,
    taskObj?.taskId,
    taskObj?.id,
    dataObj?.taskId,
    dataObj?.taskID,
    dataObj?.id,
    dataTaskObj?.taskId,
    dataTaskObj?.id,
    rootResults?.[0]?.taskId,
    dataResults?.[0]?.taskId,
    dataArray?.[0]?.taskId,
    dataArray?.[0]?.id,
    dataStringCandidate
  );
};

const extractImageUrl = (payload: JsonLike): string => {
  if (!payload) return '';

  const dataObj = payload.data as Record<string, unknown> | undefined;
  const rootResults = payload.results as Array<Record<string, unknown>> | undefined;
  const dataResults = dataObj?.results as Array<Record<string, unknown>> | undefined;
  const dataImages = dataObj?.images as Array<Record<string, unknown>> | undefined;
  const outputObj = payload.output as Record<string, unknown> | undefined;
  const dataValue = payload.data;
  const dataUrlCandidate =
    typeof dataValue === 'string' && /^https?:\/\//i.test(dataValue) ? dataValue : '';

  return firstString(
    payload.url,
    payload.imageUrl,
    outputObj?.url,
    outputObj?.imageUrl,
    rootResults?.[0]?.url,
    dataResults?.[0]?.url,
    dataImages?.[0]?.url,
    dataObj?.url,
    dataObj?.imageUrl,
    dataUrlCandidate
  );
};

const extractWorkflowStatus = (payload: JsonLike): string | number | null => {
  if (!payload) return null;

  const dataObj = payload.data as Record<string, unknown> | undefined;
  const dataValue = payload.data;

  const fromDataValue =
    typeof dataValue === 'number' || typeof dataValue === 'string' ? dataValue : null;

  return (
    (typeof payload.status === 'number' || typeof payload.status === 'string'
      ? (payload.status as number | string)
      : null) ||
    (typeof payload.workflowStatusId === 'number' || typeof payload.workflowStatusId === 'string'
      ? (payload.workflowStatusId as number | string)
      : null) ||
    (typeof dataObj?.status === 'number' || typeof dataObj?.status === 'string'
      ? (dataObj.status as number | string)
      : null) ||
    (typeof dataObj?.workflowStatusId === 'number' || typeof dataObj?.workflowStatusId === 'string'
      ? (dataObj.workflowStatusId as number | string)
      : null) ||
    fromDataValue
  );
};

const extractImageUrlsFromTaskPayload = (payload: JsonLike): string[] => {
  if (!payload) return [];

  const dataObj = payload.data as Record<string, unknown> | undefined;
  const rootResults = payload.results as Array<Record<string, unknown>> | undefined;
  const dataResults = dataObj?.results as Array<Record<string, unknown>> | undefined;
  const dataImages = dataObj?.images as Array<Record<string, unknown>> | undefined;

  const urls = [
    ...(rootResults || []).map((entry) => entry?.url).filter((value): value is string => typeof value === 'string' && value.length > 0),
    ...(dataResults || []).map((entry) => entry?.url).filter((value): value is string => typeof value === 'string' && value.length > 0),
    ...(dataImages || []).map((entry) => entry?.url).filter((value): value is string => typeof value === 'string' && value.length > 0),
  ];

  return urls;
};

const isCompletedWorkflowStatus = (status: string | number | null): boolean => {
  if (status === null) return false;
  if (status === 100 || status === '100') return true;
  if (typeof status === 'string') {
    const normalized = status.trim().toLowerCase();
    return (
      normalized === 'completed' ||
      normalized === 'complete' ||
      normalized === 'succeeded' ||
      normalized === 'success' ||
      normalized === 'done' ||
      normalized === 'finished'
    );
  }
  return false;
};

const isFailedWorkflowStatus = (status: string | number | null): boolean => {
  if (status === null) return false;
  if (typeof status === 'number') return status >= 400;
  const normalized = status.trim().toLowerCase();
  return (
    normalized === 'failed' ||
    normalized === 'error' ||
    normalized === 'cancelled' ||
    normalized === 'canceled'
  );
};

const uploadImageToTmpfiles = async (
  image: FusaraImageInput,
  filePrefix: 'person' | 'clothing'
): Promise<string> => {
  const cached = uploadedImageCache.get(buildImageCacheKey(image));
  if (cached) return cached;

  const blob = await (await fetch(image.base64)).blob();
  const extension = mimeToExtension(image.mimeType || blob.type);
  const fileName = `${filePrefix}-${Date.now()}.${extension}`;
  const file = new File([blob], fileName, { type: image.mimeType || blob.type || 'image/jpeg' });
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(TMPFILES_UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });
  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const message = extractErrorMessage(payload, `HTTP ${response.status}`);
    throw new Error(`Fusara upload error: ${message}`);
  }

  const dataObj = payload?.data as Record<string, unknown> | undefined;
  const uploadUrl = typeof dataObj?.url === 'string' ? dataObj.url : '';
  if (!uploadUrl) {
    throw new Error('Fusara upload error: tmpfiles URL не получен.');
  }

  const directUrl = toDirectTmpfilesUrl(uploadUrl);
  uploadedImageCache.set(buildImageCacheKey(image), directUrl);
  return directUrl;
};

const waitForTask = async (taskId: string, apiKey: string): Promise<void> => {
  const started = Date.now();
  const timeoutMs = 420000;
  const pollMs = 2500;
  let lastStatus: string | number | null = null;

  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`${TASKS_URL}/${taskId}/status`, {
      headers: {
        'X-API-Key': apiKey,
      },
    });
    const payload = await parseJsonSafe(response);
    if (!response.ok) {
      const message = extractErrorMessage(payload, `HTTP ${response.status}`);
      throw new Error(`Fusara status error: ${message}`);
    }

    const status = extractWorkflowStatus(payload);
    if (status !== null) {
      lastStatus = status;
    }

    if (isCompletedWorkflowStatus(status)) return;
    if (isFailedWorkflowStatus(status)) {
      throw new Error(`Fusara task failed (${String(status)}).`);
    }

    // Some Fusara workflows don't expose a final "completed" status in /status,
    // but image URLs may already exist in /tasks/{id}.
    const taskResponse = await fetch(`${TASKS_URL}/${taskId}`, {
      headers: {
        'X-API-Key': apiKey,
      },
    });
    if (taskResponse.ok) {
      const taskPayload = await parseJsonSafe(taskResponse);
      const urls = extractImageUrlsFromTaskPayload(taskPayload);
      if (urls.length > 0) return;

      const taskStatus = extractWorkflowStatus(taskPayload);
      if (taskStatus !== null) {
        lastStatus = taskStatus;
      }
      if (isCompletedWorkflowStatus(taskStatus)) return;
      if (isFailedWorkflowStatus(taskStatus)) {
        throw new Error(`Fusara task failed (${String(taskStatus)}).`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  // Last chance: fetch full task object once more before returning timeout.
  const finalTaskResponse = await fetch(`${TASKS_URL}/${taskId}`, {
    headers: {
      'X-API-Key': apiKey,
    },
  });
  if (finalTaskResponse.ok) {
    const finalTaskPayload = await parseJsonSafe(finalTaskResponse);
    const finalUrls = extractImageUrlsFromTaskPayload(finalTaskPayload);
    if (finalUrls.length > 0) return;
    const finalStatus = extractWorkflowStatus(finalTaskPayload);
    if (finalStatus !== null) {
      lastStatus = finalStatus;
    }
  }

  throw new Error(`Fusara: timeout ожидания результата (последний статус: ${String(lastStatus ?? 'unknown')}).`);
};

const buildPrompt = (fitContext?: {
  userPose?: 'front' | 'side' | 'three_quarter' | 'unknown';
  clothingView?: ClothingView;
  bodyCoverage?: string;
  clothingName?: string;
  clothingFitHint?: ClothingFitHint;
  clothingLengthHint?: ClothingLengthHint;
  designNotes?: string;
  isLongGarment?: boolean;
  forceTallCanvas?: boolean;
}) => `
Virtual try-on edit task.

InputMediaExternalUrls mapping:
- index 0: person photo (must stay same identity and body geometry)
- index 1: clothing reference from catalog

Context:
- user pose: ${fitContext?.userPose || 'unknown'}
- clothing view: ${fitContext?.clothingView || 'unknown'}
- coverage: ${fitContext?.bodyCoverage || 'unknown'}
- clothing name: ${fitContext?.clothingName || 'unknown'}
- clothing fit class: ${fitContext?.clothingFitHint || 'unknown'}
- clothing length class: ${fitContext?.clothingLengthHint || 'unknown'}
- design notes: ${fitContext?.designNotes || 'none'}
- long garment mode: ${fitContext?.isLongGarment ? 'on' : 'off'}
- force tall canvas: ${fitContext?.forceTallCanvas ? 'on' : 'off'}

Rules:
1) Keep body geometry and proportions of the person.
2) Keep face, hair, hands, legs, shoes and background unchanged.
2.1) Face is immutable: do not alter facial shape, eyes, nose, lips, skin tone, expression.
3) Transfer clothing design and material from reference image accurately.
3.1) Use clothing reference only for garment attributes; do not copy model pose/body/footwear/accessories from reference.
3.2) Garment geometry is immutable: keep structure, silhouette, seam logic, hem shape, slit/wrap geometry.
4) Preserve garment length, drape, silhouette and cut.
4.1) Preserve fit class from reference:
    - slim = close-to-body tailored fit
    - regular = moderate natural ease
    - relaxed = visibly loose
    - oversized = intentionally roomy
4.2) Do not add extra bulk for slim/regular garments.
4.3) Preserve garment-to-body distance (ease) at shoulders, bust, waist, hips and thighs.
5) Keep realistic lighting and shadows.
6) Keep framing scale and subject width from input person photo, no horizontal stretching.
7) For long garments, extend content downward to show lower hem; keep upper frame geometry unchanged.
8) Outpaint mode for long garments: anchored extension below original bottom edge; do not recrop or recompose the whole frame.
9) Preserve garment length class precisely:
   - short: above knee
   - midi: below knee
   - maxi: around ankle, not touching the floor
   - floor: near floor
10) Do not add extra hem volume/train; preserve silhouette width and drape from reference.
11) If extra space is needed, extend environment/legs, but do not resize garment structure.
`;

const submitTask = async (
  body: Record<string, unknown>,
  apiKey: string
): Promise<{ taskId: string; imageUrl: string }> => {
  const response = await fetch(GENERATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const message = extractErrorMessage(payload, `HTTP ${response.status}`);
    const error = new Error(`Fusara generate error: ${message}`) as Error & {
      status?: number;
      reason?: string;
    };
    error.status = response.status;
    if (message.toLowerCase().includes('html response')) {
      error.reason = 'server_html';
    }
    throw error;
  }

  const taskId = extractTaskId(payload);
  const imageUrl = extractImageUrl(payload);

  if (!taskId && !imageUrl) {
    const debugPayload =
      typeof payload?.raw === 'string'
        ? payload.raw.slice(0, 240)
        : JSON.stringify(payload).slice(0, 240);
    const error = new Error(`Fusara: taskId не получен (response=${debugPayload})`) as Error & {
      status?: number;
      reason?: string;
    };
    error.status = response.status;
    error.reason = 'missing_task_id';
    throw error;
  }
  return { taskId, imageUrl };
};

const submitTaskWithRetries = async (
  body: Record<string, unknown>,
  apiKey: string,
  maxAttempts = 3
): Promise<{ taskId: string; imageUrl: string }> => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await submitTask(body, apiKey);
    } catch (error) {
      const typed = error as Error & { status?: number; reason?: string };
      lastError = typed;
      const canRetry = isTransientGenerateFailure(typed) && attempt < maxAttempts;
      if (!canRetry) {
        if (isTransientGenerateFailure(typed)) {
          const code = typed.status ? `HTTP ${typed.status}` : 'transient error';
          throw new Error(`Fusara временно недоступен (${code}). Попробуйте ещё раз через 30-60 секунд.`);
        }
        throw typed;
      }
      const backoffMs = 1200 * attempt;
      await sleep(backoffMs);
    }
  }
  if (lastError && isTransientGenerateFailure(lastError as Error & { status?: number; reason?: string })) {
    const typed = lastError as Error & { status?: number };
    const code = typed.status ? `HTTP ${typed.status}` : 'transient error';
    throw new Error(`Fusara временно недоступен (${code}). Попробуйте ещё раз через 30-60 секунд.`);
  }
  throw lastError || new Error('Fusara generate failed after retries.');
};

const buildMinimalPrompt = (fitContext?: {
  userPose?: 'front' | 'side' | 'three_quarter' | 'unknown';
  clothingView?: ClothingView;
  bodyCoverage?: string;
  clothingName?: string;
  clothingLengthHint?: ClothingLengthHint;
  designNotes?: string;
}): string => `
Virtual try-on edit.
Input 0: person (must remain same identity, body, pose, scene).
Input 1: clothing reference (use garment design only).
Context:
- user pose: ${fitContext?.userPose || 'unknown'}
- clothing view: ${fitContext?.clothingView || 'unknown'}
- coverage: ${fitContext?.bodyCoverage || 'unknown'}
- clothing: ${fitContext?.clothingName || 'unknown'}
- clothing length: ${fitContext?.clothingLengthHint || 'unknown'}
- design notes: ${fitContext?.designNotes || 'none'}
Rules:
1) Exactly one person, the original person from input 0.
2) Keep body proportions (especially shoulders/torso scale) and pose from input 0.
3) Keep face, hair, hands, legs, shoes, and background from input 0.
4) Transfer only clothing from input 1 (fabric, cut, length, asymmetry, slit/wrap).
4.1) Garment geometry is immutable: no redesign, no widening, no extra train.
5) For long garments extend downward to show complete hem; do not recrop or shrink person.
6) Preserve length class: maxi = ankle-level (not floor), floor = near floor.
`;

const buildModifyBody = (
  model: FusaraModifyModel,
  prompt: string,
  personUrl: string,
  clothingUrl: string
): Record<string, unknown> => ({
  __type: MODEL_TYPES_MODIFY[model],
  Prompt: prompt,
  NumberOfImages: 1,
  InputMediaExternalUrls: [personUrl, clothingUrl],
  ...MODEL_DEFAULTS_MODIFY[model],
});

const buildPresetFallbackBody = (
  model: FusaraModifyModel,
  prompt: string,
  personUrl: string,
  clothingUrl: string,
  outputSize: { width: number; height: number; size: string }
): Record<string, unknown> => ({
  __type: MODEL_TYPES_PRESET_FALLBACK[model],
  Prompt: prompt,
  NumberOfImages: 1,
  TaskPresets: [
    {
      __type: 1,
      Weight: 1.0,
      ExternalUrl: personUrl,
    },
    {
      __type: 2,
      Weight: 0.85,
      ExternalUrl: clothingUrl,
    },
    {
      __type: 10,
      Weight: 0.7,
      ExternalUrl: personUrl,
    },
  ],
  ...MODEL_DEFAULTS_PRESET_FALLBACK[model],
  ...(model === 'qwen'
    ? {
        Width: outputSize.width,
        Height: outputSize.height,
      }
    : {
        Size: outputSize.size,
      }),
});

export const generateFusaraModifyImage = async (params: {
  model: FusaraModifyModel;
  personImage: FusaraImageInput;
  clothingImage: FusaraImageInput;
  apiKey?: string;
  fitContext?: {
    userPose?: 'front' | 'side' | 'three_quarter' | 'unknown';
    clothingView?: ClothingView;
    bodyCoverage?: string;
    clothingName?: string;
    clothingFitHint?: ClothingFitHint;
    clothingLengthHint?: ClothingLengthHint;
    designNotes?: string;
    isLongGarment?: boolean;
    forceTallCanvas?: boolean;
  };
}): Promise<string> => {
  const apiKey = getApiKeyOrThrow(params.apiKey);
  const prompt = buildPrompt(params.fitContext);

  let outputSize = dimensionsByAspectRatio('3:4');
  try {
    const personDimensions = await loadImageDimensionsFromDataUrl(params.personImage.base64);
    outputSize = dimensionsByAspectRatio(
      getClosestAspectRatio(personDimensions.width, personDimensions.height)
    );
  } catch {
    outputSize = dimensionsByAspectRatio('3:4');
  }
  if (params.fitContext?.forceTallCanvas) {
    outputSize = dimensionsByAspectRatio('9:16');
  }

  const personExternalUrl = await uploadImageToTmpfiles(params.personImage, 'person');
  const clothingExternalUrl = await uploadImageToTmpfiles(params.clothingImage, 'clothing');

  const minimalPrompt = buildMinimalPrompt(params.fitContext);
  const candidateBodies: Record<string, unknown>[] = [
    buildModifyBody(params.model, prompt, personExternalUrl, clothingExternalUrl),
    buildPresetFallbackBody(
      params.model,
      prompt,
      personExternalUrl,
      clothingExternalUrl,
      outputSize
    ),
    buildPresetFallbackBody(
      params.model,
      minimalPrompt,
      personExternalUrl,
      clothingExternalUrl,
      outputSize
    ),
    buildModifyBody(params.model, minimalPrompt, personExternalUrl, clothingExternalUrl),
  ];

  let submitResult: { taskId: string; imageUrl: string } | null = null;
  let lastSubmitError: Error | null = null;
  for (let index = 0; index < candidateBodies.length; index += 1) {
    try {
      submitResult = await submitTaskWithRetries(candidateBodies[index], apiKey, index === 0 ? 3 : 2);
      break;
    } catch (error) {
      lastSubmitError = error as Error;
    }
  }

  if (!submitResult) {
    if (lastSubmitError) {
      throw lastSubmitError;
    }
    throw new Error('Fusara generate failed before task creation.');
  }

  if (submitResult.imageUrl) {
    return submitResult.imageUrl;
  }

  const taskId = submitResult.taskId;
  if (!taskId) {
    throw new Error('Fusara: taskId не получен после fallback.');
  }

  await waitForTask(taskId, apiKey);

  const taskResponse = await fetch(`${TASKS_URL}/${taskId}`, {
    headers: {
      'X-API-Key': apiKey,
    },
  });
  const taskPayload = await parseJsonSafe(taskResponse);
  if (!taskResponse.ok) {
    const message = extractErrorMessage(taskPayload, `HTTP ${taskResponse.status}`);
    throw new Error(`Fusara task fetch error: ${message}`);
  }

  const imageUrl = extractImageUrlsFromTaskPayload(taskPayload)[0] || '';

  if (!imageUrl) {
    throw new Error('Fusara: не удалось получить изображение.');
  }
  return imageUrl;
};
