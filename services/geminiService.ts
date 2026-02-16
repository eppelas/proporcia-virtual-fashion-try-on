import { GoogleGenAI, Modality, Type } from "@google/genai";

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
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-latest',
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
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return { isValid: false, message: "Не удалось проверить изображение." };
  } catch (error) {
    console.error("Validation error:", error);
    throw new Error("Не удалось проверить изображение. Проверьте API key и повторите.");
  }
};

export const generateVirtualTryOnImage = async (
  personImage: { base64: string; mimeType: string },
  clothingImage: { base64: string; mimeType: string },
  apiKey?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKeyOrThrow(apiKey) });
  
  const personImagePart = fileToGenerativePart(personImage.base64, personImage.mimeType);
  const clothingImagePart = fileToGenerativePart(clothingImage.base64, clothingImage.mimeType);

  const prompt = `
    Task: High-End Virtual Fashion Try-On.
    Input 1: Person (Target).
    Input 2: Clothing Item (Source).

    CORE OBJECTIVE: Dress the Person in Input 1 with the Clothing from Input 2.

    ABSOLUTE BODY GEOMETRY LOCK (HIGHEST PRIORITY):
    1. Do NOT alter the person's body shape, body volume, or proportions.
    2. Preserve exact silhouette and thickness from Input 1, especially:
       - shoulder width
       - neck thickness
       - chest/bust volume
       - upper arm and forearm thickness
       - waist and abdomen volume
       - hip, thigh, and calf thickness
    3. Never "slim down" or narrow any body part.
    4. If there is ambiguity, keep the body in the result equal to or slightly fuller than Input 1, never smaller.
    5. Garment fit must adapt to the real body shape from Input 1, not vice versa.

    STRICT RULES FOR CLOTHING (SOURCE) PRESERVATION:
    1. TEXTURE & MATERIAL: You MUST preserve the exact fabric texture (silk, cotton, velvet, denim) of Input 2. Do not smoothen it or change its reflective properties.
    2. SHAPE & CUT: You MUST preserve the exact cut and silhouette. 
       - If Input 2 has rolled-up sleeves (elbow length), the result MUST have rolled-up sleeves. DO NOT lower the sleeves to the wrist.
       - If Input 2 is oversized, it must look oversized on the person.
       - If Input 2 has an asymmetrical hem, preserve that asymmetry exactly.
    3. DETAILS: Keep all buttons, pockets, collars, and prints exactly as they appear in Input 2.

    STRICT RULES FOR PERSON (TARGET) PRESERVATION:
    1. BACKGROUND: Do NOT change pixels of the background.
    2. BODY: Do NOT change the person's legs, shoes, face, hair, hands, or body proportions. Only generate pixels where the new clothing covers the body.
    3. LIGHTING: Keep the original lighting direction and temperature of the Person's photo. Cast realistic shadows from the new clothing onto the person/ground based on this lighting.

    FINAL OUTPUT:
    - A photorealistic image where the clothing looks like it was physically worn in that specific room.
    - High fashion quality, but natural, unedited "raw photo" look.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        personImagePart,
        clothingImagePart,
        { text: prompt },
      ],
    },
    config: {
      responseModalities: [Modality.IMAGE],
      imageConfig: {
          imageSize: "1K",
          aspectRatio: "3:4" 
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
