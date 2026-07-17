# Satisfactory Train Mapper

## Summary

Satisfactory Train Mapper (STM) is a web application that provides a graphical Cortesian coordinate grid (using X & Y axes) to plot the locations of train stations, freight station configurations, railway sections, splits, merges and path and block signal for the Satisfactory factory simulation game.

## Data Models

### Train Stations

- Station Name
- Station Number
- Section In Number
- Section Out Number
- Inbound X Coordinate
- Inbound Y Coordinate
- Outbound X Coordinate
- Outbound Y Coordinate
- Numnber of Liquid Freight Stations
- Numnber of Solid Freight Stations
- Freight Station Sequence (e.g. 3 stations: 1st exit zone: Freight; next: Freight; last: Liquid )
- Freight Station Modes (load or unload)
- Freight Section Materials
- Notes

### Railway Sections

- Section Number
- Endpoint 1 Section Number
- Endpoint 1 X Coordinate
- Endpoint 1 Y Coordinate
- Endpoint 1 Signal 1 (Block or Path)
- Endpoint 1 Signal 2 (Block or Path)
- Endpoint 1 Entrance Mode (Allowed or Blocked))
- Endpoint 2 Section Number
- Endpoint 2 X Coordinate
- Endpoint 2 Y Coordinate
- Endpoint 2 Signal 1 (Block or Path)
- Endpoint 2 Signal 2 (Block or Path)
- Endpoint 2 Entrance Mode (Allowed or Blocked))

### Signals

- Signal Type (Block or Path)
- Signal Number
- Signal Coordinate X
- Signal Coordinate Y
- Section Connection 1 Number (a Section)
- Section Connection 2 Number (a Section)
- Section Connection 3 Number (a Section)

Application storage will use json files.

## User Interface

- A user definable grid size
  - Definable coordinate sections (e.g. number of subset lines)
- Sidebar with drag and drop components to add to the grid:
  - Users can drag and drop components from their icons in the sidebar to the desired location on the grid
    - Train Stations
    - Railway sections (straight and curved)
      - Connectors for signals (two per side, per-end)
      - Signals
        - Blocks
        - Paths
    - Splits
    - Merges
- Property panel for selected component on the grid
  - Displays editable component metadata in a data property table
- Ability to load and save map layouts

### Intelligent Signal Planning

For every set of completed connection points (including dead-ends), the grid should show both user-defined signals and their locations per-section, and show suggested "correct" signals that differ from what is defined (based on the allowed directions for each connected section).

## Satisfactory Railway Connection Guidelines

### General Connection and Routing Rules

- Right-hand side rule
  - Signals always go on the right-hand side relative to the direction of travel.
- Path vs Block
  - Path = before a decision point (split, merge, station entry)
  - Block = after a decision point (merge output, station exit)
- Bi‑directional sections
  - Each direction gets its own Path + Block, placed on the right-hand side relative to that direction.

### Questions and Answers/FAQ

Q: ** How do train routes determine which sections to take to the next station in the timetable?
A: Trains do not follow your intended route. They follow the shortest signaled route. If you don’t restrict splits, trains will choose the wrong branch.

Q: ** How are block and path signals placed?
A: Placement pattern is always:
- Path before the decision point
- Block after the decision point
- Right-hand side relative to direction of travel

## Other Features

The final phase of this application will add support for defining train routes (train names, stops, load/unload and material rules, etc.).
