# Routing And Signalling

## Core Rules

- Signals go on the right-hand side relative to the direction of travel.
- Path signals belong before a decision point.
- Block signals belong after a decision point.
- A bi-directional line needs a valid signal pair for each direction of travel.

## Decision Points

- Splits should be protected before the branch.
- Merges should be protected after the converging point.
- Station entries should be treated as approach points for Path placement.
- Station exits should be treated as departure points for Block placement.

## Section Logic In The App

- Each section stores a `directionMode` and per-endpoint `entranceMode`.
- Each endpoint stores left and right signal socket state.
- The editor can connect a section endpoint directly to a station side.
- Connected station endpoints are snapped to the station border point for the active layout.
- When a station layout changes, connected endpoints are re-synced so the map remains geometrically consistent.

## Signal Representation

- Signals are created as Block or Path objects.
- Signals can track which sections they are associated with.
- Signal review logic checks whether the current socket and connection configuration matches the intended routing pattern.

## Gameplay Note

- In Satisfactory, trains follow the shortest valid signaled route, not the route you intended in the timetable.
- That means uncapped branches can still pull trains onto the wrong track if the signal layout leaves multiple valid choices.
