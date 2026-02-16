import type { ClothingItem } from '../types';

const imagePath = (fileName: string): string => `${import.meta.env.BASE_URL}images/${fileName}`;

// База товаров для примерки (взято с proporcia.store).
// Используем локальные копии изображений из `public/images`,
// чтобы галерея стабильно работала и в локальном режиме, и на GitHub Pages.
export const CLOTHING_DB: ClothingItem[] = [
  {
    id: 1,
    name: 'Рубашка MOOVI',
    imageSrc: imagePath('rubashka-moovi.jpg'),
  },
  {
    id: 2,
    name: 'Платье Flexi',
    imageSrc: imagePath('plate-flexi.jpg'),
  },
  {
    id: 3,
    name: 'Платье NEO',
    imageSrc: imagePath('plate-neo.jpeg'),
  },
  {
    id: 4,
    name: 'Платье Taily',
    imageSrc: imagePath('plate-taily.jpg'),
  },
  {
    id: 5,
    name: 'Платье-жакет Jackess',
    imageSrc: imagePath('plate-zhaket-jackess.jpg'),
  },
  {
    id: 6,
    name: 'Лонгслив NAKED',
    imageSrc: imagePath('longsliv-naked.jpeg'),
  },
  {
    id: 7,
    name: 'Костюм CUT',
    imageSrc: imagePath('kostyum-cut.webp'),
  },
  {
    id: 8,
    name: 'Юбка BALI',
    imageSrc: imagePath('yubka-bali.jpg'),
  }
];
