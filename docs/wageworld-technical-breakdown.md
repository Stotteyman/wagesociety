# WageWorld Technical Breakdown

WageWorld is the browser-based 3D creator world mounted at `/wageworld` and `/play`. It is implemented inside the existing Express/EJS app without adding a separate frontend build step.

## Entry Points

- `routes/pages.js`: renders `views/pages/play.ejs` for `/play` and `/wageworld`.
- `views/pages/play.ejs`: full-screen HTML shell, settings menu, character creator menu, proximity chat UI, mobile movement controls, and import map.
- `public/js/wageworld.js`: Three.js scene, map groups, world generation, avatar movement, camera controls, controller support, NPCs, collectibles, settings behavior, and character customization.
- `server.js`: serves selected local packages from `node_modules` through `/vendor/...`.

## Runtime Dependencies

- `three`: WebGL rendering and scene primitives.
- `gsap`: short player teleport tweening.
- `simplex-noise`: terrain height variation.
- `playwright`: local render and interaction checks.
- `sharp`: already present; used by verification scripts for screenshot pixel analysis.

## Current Experience

WageWorld is a playable first-person prototype built around many connected maps rather than one large world:

- User-controlled character starts in a personal spawn house.
- The default camera mode is first person, with third-person behind and third-person front available from settings or the `V` key.
- Guests can explore the world without signing in.
- Guests are still prompted at the in-house computer to log in for saved progress, subscriptions, private spaces, and creator tools.
- The spawn house is a larger full home interior with bedroom, computer room, wardrobe/mirror area, entry area, roof, windows, furniture, and an operable front door.
- The front door transitions from the home map into the Creator Plaza hub map.
- Beds with appropriate permissions can become future spawn points.
- Computers are planned as the in-world access point for WAGE Society tools.
- Wardrobes, mirrors, and closets with appropriate permissions open character editing.
- Character faces away from the camera by default.
- WASD/arrow keys move relative to the camera/player facing direction:
  - `W`: forward
  - `S`: backward
  - `A`: strafe right
  - `D`: strafe left
  - `Shift`: sprint
- `V`: cycle POV mode.
- Desktop mouse input uses Pointer Lock after clicking into the canvas.
- `Left Ctrl` unlocks the mouse so on-screen menus and controls can be clicked.
- Touch drag rotates the camera on touchscreens.
- Camera Y is inverted by default.
- Gamepad support reads:
  - left stick for movement
  - right stick for camera rotation
  - left stick press or primary face button for sprint
- Mobile users get on-screen directional controls.
- The previous top-left brand/status HUD, bottom district panel, and back link were removed so the screen is focused on the world view.
- Door and object interactions are the intended navigation pattern between maps.
- WAGE token pickups credit the same website point/token balance used by point purchases and the point shop when the player is logged in.
- Guests can collect temporary local demo WAGE tokens while exploring, but logging in is required to bank them to the website ledger.
- NPCs are guide characters that explain systems instead of random walkers.
- Players collide with major world objects, furniture, trees, stations, and guide NPCs.

## Character Creation

Character customization is client-side and stored in `localStorage` under `wageworld.character`. It is opened from interactable wardrobe/mirror/closet objects rather than a permanent HUD button.

Supported fields:

- `name`
- `skin`
- `shirt`
- `pants`
- `hat`
- `backpack`

The current avatar is procedural mesh geometry. Each editable part uses its own material clone so changing the player does not affect NPCs or shared world assets.

Cosmetics are planned as unlockable or purchasable assets. The current color editor should become the base layer under a cosmetics inventory that can include premium looks, avatar bodies, clothing sets, accessories, and subscription perks.

## Settings Menu

The settings menu is hidden by default and opened from the cog button. It exposes user-facing controls only:

- walk speed
- POV mode
- camera sensitivity
- camera distance
- camera height
- NPC movement
- invert camera Y
- reset position
- fullscreen

Developer tuning controls from `lil-gui` were removed from the player-facing UI.

## Scene Architecture

The scene is generated procedurally in `public/js/wageworld.js`:

- `mapGroups.home` / `mapGroups.hub`: separate Three.js groups for currently implemented maps.
- `switchMap()`: toggles active map visibility, updates player map state, moves the player to the map spawn, and refreshes active map state.
- `makeTerrain()`: creates vertex-colored rolling grass terrain from simplex noise.
- `makePath()`: creates village paths.
- `makeRiver()`: creates simple water tiles.
- `makeTree()`, `makeFence()`, `makeHouse()`, `makeStall()`, `makeStage()`, `makeTower()`, `makeRewardMachine()`: build world props and district landmarks.
- `makeSpawnHouse()`: builds the initial home map with bedroom, bed, computer room, wardrobe/mirror, entry area, operable front door, and login prompt zone.
- `makePlayer()`: builds the avatar as procedural meshes at roughly human scale.
- `makeGuideNpc()`: builds stationary guide NPCs with explanatory labels.
- `makePickup()`: builds collectible WAGE token pickups with stable ids.
- `/api/wageworld/rewards/balance`: returns the signed-in user's WAGE token/point balance.
- `/api/wageworld/rewards/claim`: validates a pickup id, credits the authenticated user's `auth_users.referral_points`, and records a `point_transactions` row.
- `addCollider()` / `resolveCollisions()`: prevent players from walking through registered objects on the active map.
- `animate()`: owns the main loop and calls movement, camera, NPC, pickup, world animation, HUD updates, and rendering.

## Input Architecture

Input is normalized into per-frame movement:

- Keyboard and touch buttons set boolean movement state.
- Keyboard movement is ignored while typing in inputs, textareas, selects, contenteditable fields, settings, or character creation.
- Gamepad axes are read each frame through `navigator.getGamepads()`.
- Movement is relative to the active facing direction. In first person, `W` moves where the player is looking, `S` backs up, `A` strafes left, and `D` strafes right.
- Camera yaw/pitch is controlled separately through right mouse drag, touch drag, and gamepad right stick.
- Camera modes are `firstPerson`, `thirdPersonBack`, and `thirdPersonFront`.
- First-person mode hides the local avatar mesh to avoid clipping; third-person modes show the avatar.

## Verification

Local checks have used Playwright to verify:

- `/wageworld` returns `200 OK`.
- the WebGL canvas renders nonblank screenshots.
- the loader hides after initialization.
- settings are hidden by default and open from the cog.
- the old `.wageworld-gui` tuning panel is not present.
- WASD movement changes the player position in the intended local axes.
- right mouse drag changes camera yaw.
- mobile controls are visible without the removed bottom district panel.
- character-name typing does not trigger movement.
- guide NPCs are stationary explanatory objects.
- the loader says `Loading WageWorld` and rotates short loading quotes.
- default POV is first person, `V` cycles to third person, and the settings menu exposes POV selection.
- the larger spawn house starts as the active map and the front door transitions into the Creator Plaza hub.
- authenticated WAGE token pickup claims use `/api/wageworld/rewards/claim`.

## Known Limitations

- Character customization is local-only and not yet tied to authenticated user accounts.
- Collision is prototype-level radius collision, not yet full mesh/navmesh collision.
- Map travel now has separate home and hub scene groups, but future maps still need explicit loading, unloading, and persistence contracts.
- Proximity chat and WebRTC voice signaling exist, but there is no durable multiplayer world-state persistence yet.
- WAGE token rewards currently bridge to the existing website point ledger. A dedicated on-chain cryptocurrency wallet contract is not implemented in this repo yet.
- Gamepad support uses the browser Gamepad API and depends on browser/controller mapping.

## Suggested Next Steps

- Expand the explicit map system beyond `home` and `hub` into Market Row, Live Arena, Guild Tower, Reward Works, private spaces, and event maps.
- Expand collision to a real navigation/collision system.
- Persist character customization to a database for logged-in users.
- Add an interaction prompt system for NPCs, doors, shops, and reward machines.
- Add cosmetics inventory and commerce integration for paid looks and avatars.
- Add quest/task state for creator onboarding.
- Split `wageworld.js` into modules once behavior grows beyond prototype scale.
