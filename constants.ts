import type { ClothingItem } from './types';
import { CLOTHING_DB } from './data/clothingDb';

// Keep legacy constant in sync with the canonical local-first dataset.
export const CLOTHING_ITEMS: ClothingItem[] = CLOTHING_DB;
