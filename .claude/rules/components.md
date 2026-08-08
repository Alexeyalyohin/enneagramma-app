---
description: Правила для React-компонентов
globs: ["src/components/**", "src/app/**/page.tsx", "src/app/**/layout.tsx"]
---
- Server Components по умолчанию
- `'use client'` только при необходимости
- Один компонент = один файл, максимум 200 строк
- Props типизировать через `interface`, не `type`
- Обязательно: loading, error, empty состояния (см. Чертёж.md, БЛОК 4, для каждого экрана)
- Дизайн-токены проекта — из Чертёж.md БЛОК 4, не выдумывать свои цвета/шрифты
