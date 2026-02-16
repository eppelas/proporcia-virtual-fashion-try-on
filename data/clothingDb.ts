import type { ClothingItem } from '../types';

// База луков для галереи.
// Все предустановленные карточки используют локальные изображения из `public/images`,
// чтобы выбор карточки и примерка работали стабильно на локальном запуске.

export const CLOTHING_DB: ClothingItem[] = [
  {
    id: 1,
    name: 'Look 01',
    imageSrc: '/images/look-1.jpeg',
  },
  {
    id: 2,
    name: 'Look 02',
    imageSrc: '/images/look-2.jpeg',
  },
  {
    id: 3,
    name: 'Look 03',
    imageSrc: '/images/look-3.jpeg',
  },
  {
    id: 4,
    name: 'Look 04',
    imageSrc: '/images/look-4.jpeg',
  },
  {
    id: 5,
    name: 'Look 05',
    imageSrc: '/images/look-5.jpeg',
  },
  {
    id: 6,
    name: 'Look 06',
    imageSrc: '/images/look-1.jpeg',
  },
  {
    id: 7,
    name: 'Look 07',
    imageSrc: '/images/look-3.jpeg',
  },
  {
    id: 8,
    name: 'Шубка (замена)',
    imageSrc: '/images/look-2.jpeg',
  },

  // Слоты для загрузки своих вещей.
  {
    id: 9,
    name: 'Загрузить фото 1',
    imageSrc: '',
    isUploadable: true,
  },
  {
    id: 10,
    name: 'Загрузить фото 2',
    imageSrc: '',
    isUploadable: true,
  },
  {
    id: 11,
    name: 'Загрузить фото 3',
    imageSrc: '',
    isUploadable: true,
  },
  {
    id: 12,
    name: 'Загрузить фото 4',
    imageSrc: '',
    isUploadable: true,
  }
];
