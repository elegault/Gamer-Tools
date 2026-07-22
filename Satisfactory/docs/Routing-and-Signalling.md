# Routing And Signalling

## Train Stations

### Construction

(these are mainly guidelines for the game's build system, not this Mapper app)

- A fully-functional Train Station requires a Train Station, and any number of Freight Platforms, Fluid Freight Platforms or Empty Platforms, which can be placed after the Train Station to load or unload cargo from the train. A multiple-locomotive train only needs one Train station to stop.
- As Freight Platform (and its fluid variant) must snap to a Train Station or other rail platforms, it is impossible to split a train station into segments: it must be in a continuous straight line, requiring the use of Empty Platforms for spacing.
  - This makes Train Stations a unique challenge to site, as unlike other large factory buildings, a Train Station's entire footprint (which can easily exceed 100 meters in length) must be flat, with no slopes or layering into multiple floors possible.
- If a platform is removed from the middle of the train station, the remaining platforms not connected to the train station will not load/unload. It resumes functioning if the platforms are reconnected to a station.
- Dismantling any part of the station while a train is docking will cause all the train cars to be compressed to the available rail space next to it.
- The Train Station provides power to all connected platforms.

### Direction

Train Stations are directional, which is indicated by arrows on the platform and the construction hologram. Additionally, the round side of the roof and the side where the name is displayed is where the front of an automatically docked locomotive will be. Trains on autopilot will only stop at the station in the specified direction, passing through when going the opposite direction.

The attached Freight Platforms can be rotated either way to change which side the conveyor belt or pipe outputs are on. Not all Freight Platforms have to be rotated to the same side for the station to function.

### Bi-directional trains

A bi-directional train stop is possible by attaching a rear-facing locomotive to the train stopping there, as automated locomotives do not reverse. The train can switch to using the rear facing-locomotive to pilot the train, but only if the front-facing locomotive cannot path to the destination.

Keep in mind that if there is a way for a bi-directional train to reverse its direction, like a loop in the railroad network somewhere, it can cause the order of cars to be reversed and make the wrong items get unloaded in the wrong stations. Thus, combining bi-directional track designs with looping track designs can cause problems, and arguably single-direction looping networks become more manageable as the networks' size increases.

The appropriate direction-facing locomotive will stop at the train station selected in its "timetable" (itinerary), but can switch direction when departing said station. Therefore, only a single end station facing away from the track is required for an end stop. Middle stations along the bi-directional line may require two stations each if loading/unloading in both directions is desirable, but otherwise a single stop is also possible.

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
- UPDATED: There are two signal points on the inside of each Section (two at each point, one on either side) that can be empty, suggested or implemented.

## Gameplay Note

- In Satisfactory, trains follow the shortest valid signaled route, not the route you intended in the timetable.
- That means uncapped branches can still pull trains onto the wrong track if the signal layout leaves multiple valid choices.

## Info From [https://satisfactory.wiki.gg/wiki/Train_Signals](https://satisfactory.wiki.gg/wiki/Train_Signals)

### Pathfinding

Automated trains will stop at a red or error signal. They will also brake ahead, although they will be forcefully stopped if they fail to slow down on their own.

An important aspect of train pathfinding is that it does not re-route. A path is determined by the shortest distance to the destination, regardless of whether it is occupied by other trains. Trains won't pass the back of a signal, so an incorrect setup can make the destination unreachable.

### Signals

#### Construction

Both types of train signals can only be built on Railway tracks. Their placement automatically snaps to track joints. Alternatively, they may be also built freely along track segments,[1] as long as they're at least 12m from the end of the segment. Doing so will split the segment to form a new joint, which will not rejoin even if the signal is dismantled afterwards.

The forward direction of the signal is determined by which side of the joint is targeted. It helps to point at the track rather than the edge of the track. An arrow also indicates the forward direction.

Up to 2 signals facing opposite directions can be placed on each track joint. If only one signal is present, it will prevent trains in the opposite direction from passing through. A bi-directional track can be achieved by placing signals on both sides of the track.

#### Build modes

Train signals can be set up for right-hand traffic (common) by placing on the right in direction of travel, or left-hand drive (less common) by placing on the left in direction of travel.

Both Path signals and Block signals now have a “Left Side” and “Right Side” build mode that can be alternated by pressing R when having the hologram active.

### Blocks

A block is the area between two signals. A block which contains any part of a train is considered to be occupied, otherwise it is vacant.

Blocks are colored while a signal is being placed. Each block is given a different color and colors can be repeated on "other blocks". It can help understand signal placement errors to select a signal to place then examine where each block begins and ends by looking at their coloring.

Blocks have to have at least one entry signal, as well as at least one exit signal (which will be the next block's entry signal). Blocks on a linear track will have only one entry and one exit signal, but branches will have multiple exit signals, merges will have multiple entry signals, and more complex intersections can have multiple entry and multiple exit signals. All entry signals for a block have to be of the same type, either all Block Signals or all Path Signals.

### Block Signals

Block Signals work on a simple principle: they prevent trains from entering a block if another train already occupies it. If any part of a train is within a block ahead, then all Block Signals entering that block will be red, preventing other trains from entering that block. If the block ahead is empty, then all Block Signals entering that block will be green.

Block Signals are typically used on straight double tracks and for stations. Bidirectional tracks and junctions are better handled by Path Signals.

Note: Block Signals shouldn't be used for blocks where tracks merge from multiple entrances (multiple trains might be able to enter and collide, even if the junction is signalled properly).

### Path Signals

Path Signals are more advanced than Block Signals. They use a path reservation system to control trains. While avoidable in many scenarios, Path Signals make managing advanced networks possible.

The three important aspects of Path Signals are that they allow multiple trains to enter if their paths within the block do not intersect, do not allow a train to enter if it cannot exit, and that a Train Station cannot be within a path block.

Using Path Signals for junctions is not strictly necessary in most cases. However, it is recommended if you are building high-traffic systems with high chances of multiple trains reaching the same intersection. In this specific context, you will often hear players use the phrase "path in, block out." This is because all entry signals of a block must be of the same type. You cannot have a Block Signal and a Path Signal leading into the same junction.

#### Advanced description

Path Signals automatically subdivide a block into paths, and treat them as individual sub-blocks. An automated train will reserve a path through the block as it approaches. Other trains can reserve their own paths at the same time, as long as they do not intersect with a path that is already reserved by another train. This allows multiple trains to pass through the same block simultaneously without colliding.

Unlike Block Signals, Path Signals will "look ahead" to the Block Signal that follows a train's reserved path. The Path Signal will stop a train if it would have to stop for the next Block Signal while still traversing its reserved path. The Path Signal will turn green once the block at the end of the reserved path is vacant. This system ensures that trains do not stop in the middle of an intersection, which helps to prevent gridlocks. However, trains can be forced to stop within an intersection if their desired exit block becomes occupied with a manually driven train.

Path Signals remain red until an automated train has reserved a path through that signal, at which time they will turn green to allow the train through. Automated trains treat the Path Signal as red until it turns green because it has approved the path. An approaching automated train will not reserve a path through a Path Signal's block until the next signal is the Path Signal. This means that if there is a Block Signal just before the Path Signal, the Automated train will have to slow down because the Path Signal will remain red until the train passes the Block Signal.

It is possible to chain Path Signals one after the other for especially complex intersections to increase their throughput. Trains reserve paths through multiple Path Signals at once up to the next Block Signal, and will not pass the first Path Signal if any single portion of the path cannot be reserved.

### States

Individual Train Signals can appear in one of three "states" that reflect if Train is ok to proceed, or must stop, or there is an issue/error with Train Signal placement. Error signals are treated as red.

- 🟢 Green
  - Block Clear (Block Signal default state)
  - Path Approved (Path Signal)
- 🔴 Red
  - Block Occupied
  - Waiting for Path Reservation (Path Signal default state)
- ⚠️ Error
  - Invalid Signal
  - Signal has missing connections
    - The signal is placed on the very end of a Railway or is not connected to one, leading nowhere
  - Block has no exit signal
  - Block has conflicting entry signal types
    - All entry signals have to be either Block or Path; this does not apply to exit signals
  - Path block cannot contain stations
    - Stations cannot be placed inside Path blocks anymore, path signals now give a proper error message if a Train Station is found inside a block.
  - Signal loops into itself
    - This error means the signal failed to divide a block, even when no loops are present. It can occur when, for example, two unconnected tracks are too close to each other and a signal is placed on one of them.
    - Sometimes, there is no obvious cause for this error. Using the block color highlight can be used to diagnose which signal is causing the problem. Rebuilding the affected junction can resolve the issue.

## Signal Logic Rules (From [Reddit](https://www.reddit.com/r/SatisfactoryGame/comments/qgy9z0/signal_logic_rules/))

### Basic Rules

- A True Block is defined as the overall area either between a path signal and then a block signal, a block signal and then a path signal, or between 2 block signals.
- A Path Block is defined as the segment of rail between a path signal and the next signal of either type.
- A Block of either type must have an initiation signal and a terminal signal.
- Path Signals cannot directly lead into Train Stations.

### Basic Behaviour For Signals Going the Same Direction

- Block signals will check if any part of the True Block is occupied and prevent entry if true.
- Path signals will check if the next Path Block is occupied and if the True Block afterwards is as well.
- Path signals in sequence will chain, creating more Path Blocks while requiring a terminal block signal to set the boundary of the True Block.
- Train Stations have a hidden +100m to their pathing distance to prevent you from routing a path directly through them where the train wouldn't be stopping at said station.

### Path Signal Behaviour

- Path signals use the existing "fastest route" logic and draw a line to the next signal, reserving this as their path.
- If either the immediate Path Block or the True Block where the train exits is occupied, path signals will prevent entry.
- **Path signals WILL NOT attempt to find an alternate route if the path is currently occupied.**
- **If one entrance to a junction uses a Path Signal then ALL entrances to the same junction must also use Path Signals.**

### Chaining Path Signals

In the majority of cases you do not need to do this. As stated above, path signals reserve a path to their terminal block signal, placing more path signals between the first and the termination point does nothing productive in most use-cases. The function of chaining path signals shows when you want multiple trains on the same rail going the same direction, but they have different destinations. You can do this with block signals, but it can get clunky, and they trains will overall have a lower speed given how block signals calculate things. Chaining path signals along this route will allow multiple trains to reserve their paths to separate destinations and follow each other. This is where Path Blocks come into play. Chaining the signals breaks the overall paths into Path Blocks, so each train can be on the same rail, just in separate individual Path Blocks and therefore not colliding. This massively speeds things up when the trains will not always be there at the same time, as a single train will simply sail through to the end without having to pause or slow down.

- Chaining path signals divides an overall path into multiple, smaller Path Blocks.
- In the case of a rail that has a single destination, this accomplishes nothing useful.
- In the case of a rail that has multiple destinations, this allows trains with intersecting paths (but separate destinations) to be in the same True Block and on the same rail while not colliding due to the Path Block subdivisions.
- When only 1 train is using a chain of Path Blocks, it will treat them all as a single unit.

REMINDER: **TRAINS SET THE ROUTES, NOT SIGNALS** . Signals are merely a stop/go system, they tell a train IF it can go, not WHERE.
