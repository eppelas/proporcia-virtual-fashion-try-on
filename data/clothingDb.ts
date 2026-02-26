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
    lengthHint: 'short',
    fitHint: 'oversized',
    designNotes: 'Рубашка оверсайз с четким воротником, свободной посадкой и выраженной длиной сзади.',
    productUrl: 'https://www.proporcia.store/all/tproduct/120538870082-rubashka-moovi',
    gallery: [
      { view: 'front', imageSrc: imagePath('rubashka-moovi.jpg'), label: 'Фронт' },
      {
        view: 'three_quarter',
        imageSrc: imagePath('rubashka-moovi-three-quarter.jpg'),
        label: '3/4',
      },
      { view: 'side', imageSrc: imagePath('rubashka-moovi-side.jpg'), label: 'Бок' },
    ],
  },
  {
    id: 2,
    name: 'Платье Flexi',
    imageSrc: imagePath('plate-flexi.jpg'),
    lengthHint: 'floor',
    fitHint: 'slim',
    designNotes: 'Ажурный трикотаж, узкий силуэт, платье в пол без лишнего объема.',
    productUrl: 'https://www.proporcia.store/all/tproduct/265079450932-plate-flexi-iz-azhurnogo-trikotazha',
    gallery: [
      { view: 'front', imageSrc: imagePath('plate-flexi.jpg'), label: 'Фронт' },
      {
        view: 'three_quarter',
        imageSrc: imagePath('plate-flexi-three-quarter.jpg'),
        label: '3/4',
      },
      { view: 'side', imageSrc: imagePath('plate-flexi-side.jpg'), label: 'Бок' },
    ],
  },
  {
    id: 3,
    name: 'Платье NEO',
    imageSrc: imagePath('plate-neo.jpeg'),
    lengthHint: 'midi',
    fitHint: 'regular',
    designNotes: 'Асимметричный низ, длина миди, мягкая драпировка без шлейфа.',
    productUrl: 'https://www.proporcia.store/all/tproduct/518984193762-plate-neo-c-asimmetrichnim-nizom',
    gallery: [
      { view: 'front', imageSrc: imagePath('plate-neo.jpeg'), label: 'Фронт' },
      {
        view: 'three_quarter',
        imageSrc: imagePath('plate-neo-three-quarter.jpg'),
        label: '3/4',
      },
      { view: 'side', imageSrc: imagePath('plate-neo-side.jpg'), label: 'Бок' },
    ],
  },
  {
    id: 4,
    name: 'Платье Taily',
    imageSrc: imagePath('plate-taily.jpg'),
    lengthHint: 'maxi',
    fitHint: 'slim',
    designNotes: 'Асимметричный клин, узкий верх и вытянутый силуэт, макси ближе к щиколотке.',
    productUrl: 'https://www.proporcia.store/all/tproduct/636875684912-plate-taily-c-asimmetrichnim-klinom',
    gallery: [
      { view: 'front', imageSrc: imagePath('plate-taily.jpg'), label: 'Фронт' },
      {
        view: 'three_quarter',
        imageSrc: imagePath('plate-taily-three-quarter.jpg'),
        label: '3/4',
      },
      { view: 'side', imageSrc: imagePath('plate-taily-side.jpg'), label: 'Бок' },
    ],
  },
  {
    id: 5,
    name: 'Платье-жакет Jackess',
    imageSrc: imagePath('plate-zhaket-jackess.jpg'),
    lengthHint: 'short',
    fitHint: 'slim',
    designNotes: 'Платье-жакет мини, приталенный силуэт, двубортная передняя часть.',
    productUrl: 'https://www.proporcia.store/all/tproduct/896820373472-plate-zhaket-jackess',
    gallery: [
      { view: 'front', imageSrc: imagePath('plate-zhaket-jackess.jpg'), label: 'Фронт' },
      {
        view: 'three_quarter',
        imageSrc: imagePath('plate-zhaket-jackess-three-quarter.jpg'),
        label: '3/4',
      },
      {
        view: 'side',
        imageSrc: imagePath('plate-zhaket-jackess-side.jpg'),
        label: 'Бок',
      },
    ],
  },
  {
    id: 6,
    name: 'Лонгслив NAKED',
    imageSrc: imagePath('longsliv-naked.jpeg'),
    lengthHint: 'short',
    fitHint: 'slim',
    designNotes: 'Очень прилегающий тонкий лонгслив, легкие сборки по корпусу и рукавам.',
    productUrl: 'https://www.proporcia.store/longsleeves',
    gallery: [
      { view: 'front', imageSrc: imagePath('longsliv-naked.jpeg'), label: 'Фронт' },
      {
        view: 'three_quarter',
        imageSrc: imagePath('longsliv-naked-three-quarter.jpg'),
        label: '3/4',
      },
      { view: 'side', imageSrc: imagePath('longsliv-naked-side.jpg'), label: 'Бок' },
    ],
  },
  {
    id: 7,
    name: 'Костюм CUT',
    imageSrc: imagePath('kostyum-cut.webp'),
    lengthHint: 'maxi',
    fitHint: 'relaxed',
    designNotes: 'Расслабленный костюм, плавная асимметрия низа, без утрированного объема ткани.',
    productUrl: 'https://www.proporcia.store/all/tproduct/492963208772-plate-cut-iz-100-krapivi',
    gallery: [
      { view: 'front', imageSrc: imagePath('kostyum-cut.webp'), label: 'Фронт' },
      {
        view: 'three_quarter',
        imageSrc: imagePath('kostyum-cut-three-quarter.jpg'),
        label: '3/4',
      },
      { view: 'side', imageSrc: imagePath('kostyum-cut-side.jpg'), label: 'Бок' },
    ],
  },
  {
    id: 8,
    name: 'Юбка BALI',
    imageSrc: imagePath('yubka-bali.jpg'),
    lengthHint: 'maxi',
    fitHint: 'regular',
    designNotes: 'Юбка с запахом и выраженным асимметричным разрезом спереди, длина макси до щиколотки (не в пол), без шлейфа и без чрезмерного расширения.',
    productUrl: 'https://www.proporcia.store/skirts',
    gallery: [
      { view: 'front', imageSrc: imagePath('yubka-bali.jpg'), label: 'Фронт' },
      {
        view: 'three_quarter',
        imageSrc: imagePath('yubka-bali-three-quarter.jpg'),
        label: '3/4',
      },
      { view: 'side', imageSrc: imagePath('yubka-bali-side.jpg'), label: 'Бок' },
    ],
  }
];
