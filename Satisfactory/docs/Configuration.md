# Configuration Guide

## What Is Stored In The Map Document

- World size and editor viewport settings.
- Display toggles for canvas overlays.
- Panel docking side and panel size settings.
- Label style settings for sections and intersections.
- Per-station layout direction.
- Section direction mode, endpoint entrance mode, and signal socket state.

## Editor Settings

- `viewport.panX` and `viewport.panY` control the canvas offset.
- `viewport.zoom` controls the zoom level.
- `displayToggles.showSectionLabels` shows section labels.
- `displayToggles.showSignalEndpoints` shows signal endpoint markers.
- `displayToggles.showDirectionalIndicators` shows direction markers.
- `displayToggles.showValidationIcons` shows routing validation feedback.
- `panels.workspacePanelDock` and `panels.stationSelectorDock` control dock placement.
- `panels.workspacePanelSize` and `panels.stationSelectorSize` control dock panel size.

## Station Configuration

- `layoutDirection` controls where station metadata appears relative to the freight area.
- The app supports horizontal and vertical layouts.
- Station-side connection points are derived from layout direction, so changing the layout moves the logical border anchors too.

## Section Configuration

- `directionMode` defines allowed travel direction.
- `entranceMode` is stored per endpoint.
- `signalSockets` track the left and right socket state for each endpoint.
- `curveBend`, `curveBendMin`, and `curveBendMax` control curved section geometry.

## Practical Guidelines

- Keep station layout changes consistent with connected sections; connected endpoints are re-synced automatically.
- Use the Inspector for manual property editing instead of editing JSON by hand unless you are repairing a file.
- If you edit JSON directly, keep legacy-safe values in mind because the loader accepts some older layout names.
