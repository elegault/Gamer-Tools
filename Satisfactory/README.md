# Satisfactory Train Mapper

Satisfactory Train Mapper is a web app for planning Satisfactory rail networks on a coordinate grid. It models stations, sections, signals, junctions, and station-to-section connections so you can design, inspect, and adjust a route map before building it in game.

## Documentation

- [Quick Start](docs/QuickStart.md)
- [Developer Guide](docs/Developer.md)
- [Features Overview](docs/Features.md)
- [Configuration Guide](docs/Configuration.md)
- [Routing and Signalling](docs/Routing-and-Signalling.md)
- [Publishing Guide](docs/Publishing.md)
- [Contributing](CONTRIBUTING.md)

## What It Does

- Draws a grid-based map for train planning.
- Places stations, straight and curved sections, signals, merges, splits, and junctions.
- Shows station layouts in multiple orientations, including horizontal and vertical metadata arrangements.
- Lets you dock the Workspace and Train Stations panels on any side and resize them independently.
- Provides canvas controls for pan, zoom, Fit View, and Fit To Selection.
- Persists map data and editor settings as JSON.

## Data Model Summary

- Train stations store station identity, inbound and outbound coordinates, freight slot sequence, layout direction, and notes.
- Railway sections store section numbers, endpoint coordinates, direction mode, entrance mode, curve bend settings, and signal socket metadata.
- Signals store type, number, color, position, and section connections.
- Editor settings store viewport, panel docking and sizing, display toggles, and label styles.

## Safety Notes

- The app validates map documents with schema defaults.
- Legacy values are tolerated in several places so older map files can still load.
- Routing and signalling rules are described in the dedicated routing guide.

## Public Sharing

- GitHub Pages can host the built app from the `main` branch.
- Codespaces can open the nested Vite app directly from the repository root.
- The `testing/sample-map.json` fixture is a small starter map for first-time users.
