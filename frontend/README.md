# Frontend (Vite + React + Tailwind)

## Rodar

```bash
npm install
npm run dev
```

## PWA

O PWA é registrado apenas em build de produção.

```bash
npm run build
npm run preview
```

## API

Por padrão, o frontend chama `/api/*` e o Vite faz proxy para `http://localhost:8000`.

Se preferir, defina `VITE_API_BASE_URL`.
