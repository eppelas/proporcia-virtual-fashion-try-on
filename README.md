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
2. Запустить dev-сервер:
```bash
npm run dev
```
3. Открыть в браузере:
- [http://localhost:3000](http://localhost:3000)
- Вставить `Gemini API key` в поле `Введите код (Gemini API key)` на странице.
- Для ранней проверки «это человек / не человек» используйте Chrome (нужен `FaceDetector`).
- Поддерживаются загрузки `JPG/PNG/WEBP` и `HEIC/HEIF` (iPhone). Для `HEIC/HEIF` приложение автоматически конвертирует файл в `JPEG`.

## Security (API key)
- Никогда не коммитьте реальные ключи в репозиторий.
- Ключ хранится только локально в браузере пользователя (`localStorage`).
- Если ключ уже был опубликован, сразу выполните ротацию в Google AI Studio.

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
- Приложение не зависит от AI Studio UI: пользователь вводит ключ прямо в интерфейсе.
