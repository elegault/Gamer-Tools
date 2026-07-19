# Developer Guide

## Project Layout

- `app/src/App.tsx` owns the shell layout and side-panel resizing for the Build Palette and Inspector.
- `app/src/components/GridCanvas.tsx` owns the main canvas, docked panels, fit commands, and most interaction logic.
- `app/src/components/Inspector.tsx` handles property editing for the selected entity.
- `app/src/store/editorStore.ts` contains the editor state, map mutations, routing helpers, and persistence-related logic.
- `app/src/models/mapSchema.ts` defines the document schema and default values.

## Available Scripts

- `npm run dev` starts the local dev server.
- `npm run build` type-checks and creates a production build.
- `npm run lint` runs ESLint across the app.
- `npm run preview` serves the production build locally.

## Validation Expectations

- Use `npm run build` after editing TypeScript or schema logic.
- Use `npm run lint` when you change interaction code or UI structure.
- Keep schema defaults aligned with the editor store so old maps continue to load.

## Implementation Notes

- The editor state is persisted as JSON.
- Station connection points are derived from the active layout direction, so geometry and inspector settings must stay in sync.
- Docked panel size and dock-side settings are stored with the map document.
- Changes to routing or signalling should update both the store helpers and any visual review logic in the canvas.
