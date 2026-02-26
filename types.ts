export type ClothingView = 'front' | 'side' | 'three_quarter';
export type ClothingLengthHint = 'short' | 'midi' | 'maxi' | 'floor';
export type ClothingFitHint = 'slim' | 'regular' | 'relaxed' | 'oversized';

export interface ClothingVariant {
  view: ClothingView;
  imageSrc: string;
  label?: string;
}

export interface ClothingItem {
  id: number;
  name: string;
  imageSrc: string;
  productUrl?: string;
  gallery?: ClothingVariant[];
  lengthHint?: ClothingLengthHint;
  fitHint?: ClothingFitHint;
  designNotes?: string;
  isUploadable?: boolean;
}
