# WageWorld Technical Breakdown

WageWorld is the browser-based 3D creator world mounted at `/wageworld` and `/play`. It is implemented inside the existing Express/EJS app without adding a separate frontend build step.

## Entry Points

- `routes/pages.js`: renders `views/pages/play.ejs` for `/play` and `/wageworld`.
- `views/pages/play.ejs`: full-screen HTML shell, HUD, district buttons, settings menu, character creator menu, mobile movement controls, and import map.
- `public/js/wageworld.js`: Three.js scene, world generation, avatar movement, camera controls, controller support, NPCs, collectibles, settings behavior, and character customization.
- `server.js`: serves selected local packages from `node_modules` through `/vendor/...`.

## Runtime Dependencies

- `three`: WebGL rendering and scene primitives.
- `gsap`: short player teleport tweening.
- `simplex-noise`: terrain height variation.
- `playwright`: local render and interaction checks.
- `sharp`: already present; used by verification scripts for screenshot pixel analysis.

## Current Experience

WageWorld is a playable third-person prototype intended to become many connected maps rather than one large world:

- User-controlled character starts in a personal spawn house.
- Guests can explore the world without signing in.
- Guests are still prompted at the in-house computer to log in for saved progress, subscriptions, private spaces, and creator tools.
- The spawn house contains a bed, computer, and wardrobe/mirror.
- Beds with appropriate permissions can become future spawn points.
- Computers are planned as the in-world access point for WAGE Society tools.
- Wardrobes, mirrors, and closets with appropriate permissions open character editing.
- Character faces away from the camera by default.
- WASD/arrow keys move relative to the character:
  - `W`: forward
  - `S`: backward
  - `A`: strafe left
  - `D`: strafe right
  - `Shift`: sprint
- Right mouse drag rotates the camera on desktop.
- Touch drag rotates the camera on touchscreens.
- Gamepad support reads:
  - left stick for movement
  - right stick for camera rotation
  - left stick press or primary face button for sprint
- Mobile users get on-screen directional controls.
- District buttons currently prototype travel between planned maps: Spawn House, Creator Plaza, Market Row, Live Arena, Guild Tower, and Reward Works.
- Coins can be collected to increment the rewards HUD.
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

- `makeTerrain()`: creates vertex-colored rolling grass terrain from simplex noise.
- `makePath()`: creates village paths.
- `makeRiver()`: creates simple water tiles.
- `makeTree()`, `makeFence()`, `makeHouse()`, `makeStall()`, `makeStage()`, `makeTower()`, `makeRewardMachine()`: build world props and district landmarks.
- `makeSpawnHouse()`: builds the initial home map with bed, computer, wardrobe/mirror, and login prompt zone.
- `makePlayer()`: builds the avatar as procedural meshes at roughly human scale.
- `makeGuideNpc()`: builds stationary guide NPCs with explanatory labels.
- `makePickup()`: builds collectible reward coins.
- `addCollider()` / `resolveCollisions()`: prevent players from walking through registered objects.
- `animate()`: owns the main loop and calls movement, camera, NPC, pickup, world animation, HUD updates, and rendering.

## Input Architecture

Input is normalized into per-frame movement:

- Keyboard and touch buttons set boolean movement state.
- Keyboard movement is ignored while typing in inputs, textareas, selects, contenteditable fields, settings, or character creation.
- Gamepad axes are read each frame through `navigator.getGamepads()`.
- Movement is character-relative, not camera-relative.
- Camera yaw/pitch is controlled separately through right mouse drag, touch drag, and gamepad right stick.
- The camera follows the player using smoothed interpolation.

## Verification

Local checks have used Playwright to verify:

- `/wageworld` returns `200 OK`.
- the WebGL canvas renders nonblank screenshots.
- the loader hides after initialization.
- settings are hidden by default and open from the cog.
- the old `.wageworld-gui` tuning panel is not present.
- WASD movement changes the player position in the intended local axes.
- right mouse drag changes camera yaw.
- mobile controls are visible and do not overlap the bottom panel.
- character-name typing does not trigger movement.
- guide NPCs are stationary explanatory objects.
- the loader says `Loading WageWorld` and rotates short loading quotes.

## Known Limitations

- Character customization is local-only and not yet tied to authenticated user accounts.
- Collision is prototype-level radius collision, not yet full mesh/navmesh collision.
- Map travel is currently represented by teleport buttons and shared scene content; future work should split maps into explicit loaded instances.
- No multiplayer/session sync exists yet.
- Gamepad support uses the browser Gamepad API and depends on browser/controller mapping.

## Suggested Next Steps

- Replace the shared prototype scene with explicit map instances and transition/loading flow.
- Expand collision to a real navigation/collision system.
- Persist character customization to a database for logged-in users.
- Add an interaction prompt system for NPCs, doors, shops, and reward machines.
- Add cosmetics inventory and commerce integration for paid looks and avatars.
- Add quest/task state for creator onboarding.
- Split `wageworld.js` into modules once behavior grows beyond prototype scale.
