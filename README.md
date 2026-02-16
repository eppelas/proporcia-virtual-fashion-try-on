<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Proporcia Virtual Fashion Try-On

Локальная версия проекта после переноса из Google AI Studio.

## Что уже подготовлено
- Галерея look-карточек переведена на локальные изображения (`public/images/*`), без зависимостей от внешних URL страниц.
- Проблемная карточка «шубки» заменена на локальный ассет.
- Слоты `Загрузить фото 1..4` оставлены для пользовательских вещей.

## Local Run

**Prerequisites**
- Node.js 20+ (или актуальный LTS)
- npm

1. Установить зависимости:
```bash
npm install
```
2. Заполнить `.env.local`:
```env
GEMINI_API_KEY=your_real_key_here
```
3. Запустить dev-сервер:
```bash
npm run dev
```
4. Открыть в браузере:
- [http://localhost:3000](http://localhost:3000)

## Security (API key)
- Никогда не коммитьте реальные ключи в репозиторий.
- `.env`, `.env.*` и `.env.local` игнорируются через `.gitignore`; в GitHub должен попадать только шаблон `.env.example`.
- Если ключ уже был опубликован, сразу выполните ротацию в Google AI Studio и замените его локально.
- Для запуска без файла можно использовать переменную окружения в сессии терминала:
```bash
GEMINI_API_KEY=your_real_key_here npm run dev
```
- Для публичного GitHub Pages ключ в build не требуется: при первом нажатии «Примерить образ» приложение запросит `GEMINI_API_KEY` в браузере и сохранит его только локально (localStorage).

## Production build
```bash
npm run build
npm run preview
```

## GitHub Pages
- В репозитории включен workflow `/.github/workflows/deploy-pages.yml`.
- После пуша в `main` деплой стартует автоматически.
- Для project Pages автоматически выставляется base path `/<repo-name>/`.

## Примечание по AI Studio
- Проверка `window.aistudio` в приложении остается совместимой, но локально запуск не зависит от AI Studio UI и использует ключ из `.env.local`.
