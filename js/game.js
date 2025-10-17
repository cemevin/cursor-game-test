// Minimal Phaser 3 isometric point-and-click puzzle prototype

(function() {
	const TILE_W = 64; // width of diamond
	const TILE_H = 32; // height of diamond
	const GRID_W = 11;
	const GRID_H = 11;

	const DEPTHS = {
		floor: 0,
		player: 10,
		wall: 15,
		item: 3,
		lever: 2,
		hover: 1,
		path: 1,
	};

	const COLORS = {
		floor: 0x2a2f4a,
		void: 0x11131f,
		wall: 0x3a3f5f,
		bridge: 0x4a7f6a,
		bridgeOff: 0x203b32,
		doorClosed: 0x6b3f3f,
		doorOpen: 0x2f6b3f,
		lever: 0xe3b341,
		key: 0xf3e26c,
		player: 0x8bbcff,
		path: 0x8fd2ff
	};

	// Grid cell types
	const CELL = {
		VOID: 0,
		FLOOR: 1,
		WALL: 2, // Keep for backward compatibility
		WALLNORTH: 7,
		WALLSOUTH: 8,
		WALLEAST: 9,
		WALLWEST: 10,
		BRIDGE: 3,
		DOOR_CLOSED: 4,
		DOOR_OPEN: 5,
		DOORWAY: 6
	};

	// World state
	let game, scene;

	const config = {
		type: Phaser.AUTO,
		parent: 'game-root',
		backgroundColor: '#0f1220',
		scale: {
			mode: Phaser.Scale.RESIZE,
			width: window.innerWidth,
			height: window.innerHeight
		},
		physics: { default: 'arcade' },
		scene: { preload, create, update }
	};

	function preload() {
		// Local assets — place images under /assets per README mapping.
		// Missing files will be ignored (fallback textures will be used at runtime).
		this.load.on('loaderror', () => {/* ignore to allow fallbacks */});
		// Optional mapping file lets you point to Kenney assets without renaming
		this.load.json('asset_map', 'assets/mapping.json');

		
		// Wait for the JSON to load, then load the player textures
		this.load.once('complete', () => {
			const mapping = this.cache.json.get('asset_map');
			if (mapping && mapping.player_sheet) {
				const directions = ['north', 'south', 'east', 'west'];
				
				if (mapping.player_sheet.walk) {
					const walk = mapping.player_sheet.walk;
					const numFrames = walk.num_frames || 4;
					
					for (const dir of directions) {
						if (walk[dir]) {
							for (let i = 0; i < numFrames; i++) {
								const framePath = walk[dir].replace('.png', `${i}.png`);
								console.log(`Loading texture: ${framePath}`);
								this.load.image(framePath, framePath);
							}
						}
					}
				}
				
				if (mapping.player_sheet.idle) {
					const idle = mapping.player_sheet.idle;
					const numFrames = idle.num_frames || 4;
					
					for (const dir of directions) {
						if (idle[dir]) {
							for (let i = 0; i < numFrames; i++) {
								const framePath = idle[dir].replace('.png', `${i}.png`);
								console.log(`Loading texture: ${framePath}`);
								this.load.image(framePath, framePath);
							}
						}
					}
				}
				
				// Start loading the player textures
				this.load.start();
			}
		});

		this.load.image('tile_floor_img', 'assets/tiles/floor.png');
		this.load.image('tile_wall_img', 'assets/tiles/wall.png');
		this.load.image('tile_bridge_on_img', 'assets/tiles/bridge_on.png');
		this.load.image('tile_bridge_off_img', 'assets/tiles/bridge_off.png');
		this.load.image('player_img', 'assets/player/player.png');
		this.load.image('item_key_img', 'assets/items/key.png');
		this.load.image('lever_img', 'assets/props/lever.png');
		this.load.image('door_closed_img', 'assets/props/door_closed.png');
		this.load.image('door_open_img', 'assets/props/door_open.png');
		this.load.image('path_dot_img', 'assets/ui/path_dot.png');

	}

	function create() {
		scene = this;
		// If a mapping JSON exists, load those images first, then finish init.
		const mapping = this.cache.json.get('asset_map');
		if (mapping && typeof mapping === 'object') {
			let queued = 0;
			for (const [key, value] of Object.entries(mapping)) {
				// Skip level_file - it's text, not an image
				if (key === 'level_file') continue;
				
				if (typeof value === 'string' && value.length && !this.textures.exists(key)) {
					this.load.image(key, value);
					queued++;
				} else if (typeof value === 'object' && value !== null) {
					// Handle nested structures like wall: {n: "path", s: "path", ...}
					for (const [subKey, subPath] of Object.entries(value)) {
						if (typeof subPath === 'string' && subPath.length) {
							const textureKey = `${key}_${subKey}`;
							if (!this.textures.exists(textureKey)) {
								this.load.image(textureKey, subPath);
								queued++;
							}
						}
					}
				}
			}
			// Load level file separately as text
			if (mapping.level_file && typeof mapping.level_file === 'string') {
				console.log('Queueing level file load:', mapping.level_file);
				this.load.text('level_file', mapping.level_file);
				queued++;
			}
			// Player spritesheet support via mapping fields
			if (mapping.player_sheet && mapping.player_sheet.path && mapping.player_sheet.frameWidth && mapping.player_sheet.frameHeight) {
				this.load.spritesheet('player_sheet', mapping.player_sheet.path, {
					frameWidth: mapping.player_sheet.frameWidth,
					frameHeight: mapping.player_sheet.frameHeight
				});
				queued++;
			}
			// Or four separate directional strips
			if (mapping.player_sheet_dirs && typeof mapping.player_sheet_dirs === 'object') {
				const dirs = ['up','right','down','left'];
				for (const d of dirs) {
					const conf = mapping.player_sheet_dirs[d];
					if (conf && conf.path && conf.frameWidth && conf.frameHeight) {
						this.load.spritesheet(`player_sheet_${d}`, conf.path, {
							frameWidth: conf.frameWidth,
							frameHeight: conf.frameHeight
						});
						queued++;
					}
				}
			}
			// Or four static directional images
			if (mapping.player_static_dirs && typeof mapping.player_static_dirs === 'object') {
				const dirs = ['up','right','down','left'];
				for (const d of dirs) {
					const pth = mapping.player_static_dirs[d];
					if (typeof pth === 'string' && pth.length) {
						this.load.image(`player_static_${d}`, pth);
						queued++;
					}
				}
			}
			if (queued > 0) {
				this.load.once('complete', () => finishCreate(this));
				this.load.start();
				return;
			}
		}
		finishCreate(this);
	}

	function finishCreate(self) {
		const s = self;
		s.assetMap = s.cache.json.get('asset_map') || {};

		// Scan for available levels and populate dropdown
		scanAvailableLevels();

		// Initialize player object before createLevel() so it can be modified by level loading
		s.player = {
			gx: 2,
			gy: 2,
			path: [],
			pendingAction: null
		};
		
		// Initialize objects layer
		s.objects = {};

		s.grid = createLevel();
		s.bridgeOn = false; // lever controls this

		createTextures(s);

		s.isoOrigin = new Phaser.Math.Vector2(0, 0);
		updateIsoOrigin(s);
		// Improve rendering stability at zoomed levels
		s.cameras.main.roundPixels = true;

		s.graphics = s.add.graphics();
		s.overlay = s.add.graphics();
		// Sprite caches
		s.tileSprites = [];
		s.objectSprites = []; // For doors, etc. rendered on top of tiles
		s.propSprites = [];
		s.itemSprites = [];
		s.pathSprites = [];
		s.playerSprite = null;
		s.hoverSprite = s.add.image(0, 0, 'tile_hover').setVisible(false);
		s.playerFacing = 'down'; // 'up'|'right'|'down'|'left'
		createPlayerAnimations(s);

		s.inventory = null; // { kind: 'key' }
		s.items = []; // No default items - only from level data

		s.props = {
			door: null,      // Legacy single door
			lever: null,     // Legacy single lever
			levers: [],      // New: array of levers with IDs
			doors: [],       // New: array of doors with IDs
			bridgeTiles: []
		};

		drawWorld(s);
		updateHUD(s);

		s.input.on('pointerdown', (pointer) => {
			const world = pointer.positionToCamera(s.cameras.main);
			const grid = screenToGrid(world.x, world.y, s.isoOrigin);
			if (!inBounds(grid.gx, grid.gy)) return;

			const targetItem = findItemAt(s, grid.gx, grid.gy);
			const targetProp = findPropAt(s, grid.gx, grid.gy);
			if (targetItem || targetProp) {
				queueMoveThenInteract(s, grid.gx, grid.gy, targetItem, targetProp);
			} else {
				movePlayerTo(s, grid.gx, grid.gy);
			}
		});

		s.input.on('pointermove', (pointer) => {
			const world = pointer.positionToCamera(s.cameras.main);
			const grid = screenToGrid(world.x, world.y, s.isoOrigin);
			if (!inBounds(grid.gx, grid.gy)) { s.hoverSprite.setVisible(false); return; }
			const p = gridToScreen(grid.gx, grid.gy, s.isoOrigin);
			s.hoverSprite.setPosition(p.x, p.y);
			applyTileSpriteAdjustments(s, s.hoverSprite, 'tile_floor_img');
			s.hoverSprite.setDepth(p.y + DEPTHS.hover).setVisible(true);
		});

		s.scale.on('resize', () => {
			updateIsoOrigin(s);
			drawWorld(s);
			if (s.hoverSprite) s.hoverSprite.setVisible(false);
		});

		// Zoom slider hookup
		const zoomInput = document.getElementById('zoom');
		const zoomVal = document.getElementById('zoomVal');
		if (zoomInput) {
			const snapZoom = (z) => {
				const zNum = Number(z);
				return Math.max(0.5, Math.round(zNum / 0.5) * 0.5);
			};
			const applyZoom = (z) => {
				const snapped = snapZoom(z);
				const cam = s.cameras.main;
				// Keep player centered while zooming
				const p = gridToScreen(s.player.gx, s.player.gy, s.isoOrigin);
				cam.setZoom(snapped);
				cam.centerOn(p.x, p.y);
				if (zoomVal) zoomVal.textContent = `${snapped.toFixed(2)}x`;
				// reflect snapped value back to slider for clarity
				if (Math.abs((Number(zoomInput.value) || 0) - snapped) > 0.0001) zoomInput.value = String(snapped);
			};
			// Delay apply until after first frame so Phaser doesn't overwrite DOM focus
			s.time.delayedCall(0, () => applyZoom(zoomInput.value || 1));
			zoomInput.addEventListener('input', (e) => applyZoom(e.target.value));
		}

		// Arrow keys pan (kept for convenience)
		s.cursors = s.input.keyboard.createCursorKeys();

		// Scroll wheel zoom
		s.input.on('wheel', (pointer, gameObjects, dx, dy, dz, event) => {
			const cur = Number(zoomInput?.value || cam.zoom || 1);
			const delta = dy > 0 ? -0.5 : 0.5;
			const next = Math.min(3, Math.max(0.5, cur + delta));
			if (zoomInput) zoomInput.value = String(next);
			zoomInput && zoomInput.dispatchEvent(new Event('input'));
			if (event) event.preventDefault();
		});
	}

	function update() {
		stepPlayer(scene, 3);
		if (scene && scene.cursors) {
			const cam = scene.cameras.main;
			const speed = 6 / cam.zoom; // consistent feel across zoom levels
			let dx = 0, dy = 0;
			if (scene.cursors.left.isDown) dx -= speed;
			if (scene.cursors.right.isDown) dx += speed;
			if (scene.cursors.up.isDown) dy -= speed;
			if (scene.cursors.down.isDown) dy += speed;
			if (dx || dy) cam.setScroll(cam.scrollX + dx, cam.scrollY + dy);
		}
	}

	function createLevel() {
		const amap = scene.assetMap || {};
		console.log('createLevel called, assetMap:', amap);
		console.log('Level file path:', amap.level_file);
		if (amap.level_file) {
			console.log('Loading level from:', amap.level_file);
			return loadLevelFromText(scene, amap.level_file);
		}
		console.log('No level_file found, using fallback level');
		// Fallback: simple generated level
		const g = new Array(GRID_H).fill(0).map(() => new Array(GRID_W).fill(CELL.VOID));
		for (let y = 1; y < GRID_H - 1; y++) {
			for (let x = 1; x < GRID_W - 1; x++) {
				g[y][x] = CELL.FLOOR;
			}
		}
		g[6][5] = CELL.VOID; g[7][5] = CELL.VOID; g[8][5] = CELL.VOID;
		g[2][7] = CELL.DOOR;
		for (let x = 4; x <= 6; x++) g[3][x] = CELL.WALLNORTH; // Default to north-facing walls
		return g;
	}

	function loadLevelFromText(s, path) {
		console.log(`Trying to load level from: ${path}`);
		const raw = s.cache.text.get('level_file');
		console.log(`Raw level data:`, raw);
		if (!raw) {
			console.log(`No level data found, queueing load...`);
			// queue load then recreate
			s.load.text(path, path);
			s.load.once('complete', () => {
				console.log(`Level load complete, recreating...`);
				const grid = loadLevelFromText(s, path);
				s.grid = grid;
				drawWorld(s);
			});
			s.load.start();
			return new Array(GRID_H).fill(0).map(() => new Array(GRID_W).fill(CELL.VOID));
		}
		console.log(`Parsing level data...`);
		const lines = raw.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.length > 0 && !l.startsWith('#'));
		console.log(`Level lines:`, lines);
		const h = Math.min(GRID_H, lines.length);
		const w = GRID_W;
		const grid = new Array(GRID_H).fill(0).map(() => new Array(GRID_W).fill(CELL.VOID));
		// Reset entities - no defaults, only what's in the level file
		s.items = [];
		s.props = { 
			door: null,      // Legacy single door
			lever: null,     // Legacy single lever  
			levers: [],      // New: array of levers with IDs
			doors: [],       // New: array of doors with IDs
			bridgeTiles: [] 
		};
		s.wallOverride = {}; // key "gx,gy" -> one of: n,s,e,w,ne,nw,se,sw
		s.objects = {}; // key "gx,gy" -> {type: 'door_closed', dir: 'n'}
		s.player.gx = 2; s.player.gy = 2;
		
		// Support both old token format and new character format (with multi-char support)
		const isTokenFormat = lines.length > 0 && lines[0].includes(' ');
		
		for (let y = 0; y < h; y++) {
			if (isTokenFormat) {
				// Old 2-character token format (space-separated)
				const tokens = lines[y].split(/\s+/);
				console.log(`Line ${y} (token format):`, tokens);
				for (let x = 0; x < Math.min(w, tokens.length); x++) {
					const ch = tokens[x];
					parseOldTokenFormat(s, grid, ch, x, y);
				}
			} else {
				// New character format - parse potential multi-character tokens
				const line = lines[y];
				console.log(`Line ${y} (char format):`, line);
				const tokens = parseLineTokens(line);
				for (let x = 0; x < Math.min(w, tokens.length); x++) {
					const token = tokens[x];
					parseNewCharFormat(s, grid, token, x, y);
				}
			}
		}
		
		console.log(`Final props:`, s.props);
		console.log(`Final wall overrides:`, s.wallOverride);
		console.log(`Final grid:`, grid);
		return grid;
	}
	
	// Parse line into tokens, handling multi-character sequences
	function parseLineTokens(line) {
		const tokens = [];
		let i = 0;
		
		while (i < line.length) {
			const char = line[i];
			
			// Check for multi-character tokens (L1, D1, d2, etc)
			if ((char === 'L' || char === 'D' || char === 'd') && 
			    i + 1 < line.length && /\d/.test(line[i + 1])) {
				// Multi-character token
				let token = char;
				i++;
				while (i < line.length && /\d/.test(line[i])) {
					token += line[i];
					i++;
				}
				tokens.push(token);
			} else {
				// Single character
				tokens.push(char);
				i++;
			}
		}
		
		return tokens;
		
		console.log(`Final wall overrides:`, s.wallOverride);
		console.log(`Final grid:`, grid);
		return grid;
	}

	// Parse new single-character format (from editor)
	function parseNewCharFormat(s, grid, ch, x, y) {
		// Check for multi-character tokens (L1, D1, etc)
		if (ch.length > 1) {
			parseMultiCharToken(s, grid, ch, x, y);
			return;
		}
		
		switch (ch) {
			case ' ':
				grid[y][x] = CELL.VOID;
				break;
			case '.':
				grid[y][x] = CELL.FLOOR;
				break;
			case '#':
				grid[y][x] = CELL.WALLNORTH; // Default wall
				break;
			case '7': // Wall North
				grid[y][x] = CELL.FLOOR;
				s.objects[`${x},${y}`] = { type: 'wall', dir: 'n' };
				break;
			case '8': // Wall South  
				grid[y][x] = CELL.FLOOR;
				s.objects[`${x},${y}`] = { type: 'wall', dir: 's' };
				break;
			case '9': // Wall East
				grid[y][x] = CELL.FLOOR;
				s.objects[`${x},${y}`] = { type: 'wall', dir: 'e' };
				break;
			case '0': // Wall West
				grid[y][x] = CELL.FLOOR;
				s.objects[`${x},${y}`] = { type: 'wall', dir: 'w' };
				break;
			case 'D': // Door Closed (default, no ID)
			case '1': case '2': case '3': case '4': // Directional doors closed
				grid[y][x] = CELL.FLOOR;
				const closedDir = ch === 'D' ? 's' : ['n','s','e','w'][parseInt(ch)-1];
				s.objects[`${x},${y}`] = { type: 'door_closed', dir: closedDir };
				break;
			case 'd': // Door Open (default, no ID)
			case '5': case '6': case '!': case '@': // Directional doors open
				grid[y][x] = CELL.FLOOR;
				const openDirs = {'d': 's', '5': 'n', '6': 's', '!': 'e', '@': 'w'};
				s.objects[`${x},${y}`] = { type: 'door_open', dir: openDirs[ch] };
				break;
			case 'B': // Bridge On
				grid[y][x] = CELL.BRIDGE;
				s.props.bridgeTiles.push({ gx: x, gy: y });
				break;
			case 'b': // Bridge Off
				grid[y][x] = CELL.VOID;
				s.props.bridgeTiles.push({ gx: x, gy: y });
				break;
			case 'L': // Lever (no ID)
				grid[y][x] = CELL.FLOOR;
				if (!s.props.levers) s.props.levers = [];
				s.props.levers.push({ gx: x, gy: y, id: null });
				break;
			case 'K': // Key
				grid[y][x] = CELL.FLOOR;
				s.items.push({ gx: x, gy: y, kind: 'key' });
				break;
			case 'P': // Player start
				grid[y][x] = CELL.FLOOR;
				s.player.gx = x;
				s.player.gy = y;
				break;
			default:
				grid[y][x] = CELL.VOID;
				break;
		}
	}
	
	// Parse multi-character tokens like L1, D1, d2
	function parseMultiCharToken(s, grid, token, x, y) {
		const type = token[0];
		const id = token.substring(1);
		
		switch (type) {
			case 'L': // Lever with ID (L1, L2, etc)
				grid[y][x] = CELL.FLOOR;
				if (!s.props.levers) s.props.levers = [];
				s.props.levers.push({ gx: x, gy: y, id: id });
				console.log(`Lever with ID ${id} at ${x},${y}`);
				break;
			case 'D': // Door Closed with ID (D1, D2, etc)
				grid[y][x] = CELL.FLOOR;
				if (!s.props.doors) s.props.doors = [];
				s.props.doors.push({ gx: x, gy: y, id: id, open: false, dir: 's' });
				s.objects[`${x},${y}`] = { type: 'door_closed', dir: 's', id: id };
				console.log(`Closed door with ID ${id} at ${x},${y}`);
				break;
			case 'd': // Door Open with ID (d1, d2, etc)
				grid[y][x] = CELL.FLOOR;
				if (!s.props.doors) s.props.doors = [];
				s.props.doors.push({ gx: x, gy: y, id: id, open: true, dir: 's' });
				s.objects[`${x},${y}`] = { type: 'door_open', dir: 's', id: id };
				console.log(`Open door with ID ${id} at ${x},${y}`);
				break;
			default:
				grid[y][x] = CELL.VOID;
				break;
		}
	}

	// Parse old 2-character token format (existing logic)
	function parseOldTokenFormat(s, grid, ch, x, y) {
		// All tiles now use 2-character codes
		if (ch.length === 2) {
			const type = ch[0];
			const subtype = ch[1];
			
			if (ch === 'FL') {
				// Basic floor
				grid[y][x] = CELL.FLOOR;
			} else if (ch === 'VO') {
				// Void
				grid[y][x] = CELL.VOID;
			} else if (type === 'F' && ['N', 'S', 'E', 'W'].includes(subtype)) {
				// Directional floor: FN, FS, FE, FW
				grid[y][x] = CELL.FLOOR;
				s.wallOverride[`${x},${y}`] = { type: 'floor', dir: subtype.toLowerCase() };
				console.log(`Floor override at ${x},${y}: ${subtype.toLowerCase()}`);
			} else if (type === 'W' && ['N', 'S', 'E', 'W'].includes(subtype)) {
				// Wall: WN, WS, WE, WW - place on floor as objects
				grid[y][x] = CELL.FLOOR;
				if (!s.objects) s.objects = {};
				s.objects[`${x},${y}`] = { type: 'wall', dir: subtype.toLowerCase() };
				console.log(`Directional wall object at ${x},${y}: ${subtype.toLowerCase()}`);
			} else if (['H', 'V'].includes(type) && ['N', 'S', 'E', 'W'].includes(subtype)) {
				// Half-wall, Window: HN, HS, VN, VS, etc. - keep as objects on floor
				grid[y][x] = CELL.FLOOR;
				if (!s.objects) s.objects = {};
				const typeMap = { 'H': 'half_wall', 'V': 'window' };
				s.objects[`${x},${y}`] = { type: typeMap[type], dir: subtype.toLowerCase() };
				console.log(`${typeMap[type]} object at ${x},${y}: ${subtype.toLowerCase()}`);
			} else if (type === 'C' && ['N', 'S', 'E', 'W'].includes(subtype)) {
				// Closed door: CN, CS, CE, CW - place on floor
				grid[y][x] = CELL.FLOOR;
				if (!s.objects) s.objects = {};
				s.objects[`${x},${y}`] = { type: 'door_closed', dir: subtype.toLowerCase() };
				console.log(`Door closed object at ${x},${y}: ${subtype.toLowerCase()}`);
			} else if (type === 'O' && ['N', 'S', 'E', 'W'].includes(subtype)) {
				// Open door: ON, OS, OE, OW - place on floor
				grid[y][x] = CELL.FLOOR;
				if (!s.objects) s.objects = {};
				s.objects[`${x},${y}`] = { type: 'door_open', dir: subtype.toLowerCase() };
				console.log(`Door open object at ${x},${y}: ${subtype.toLowerCase()}`);
			} else if (type === 'R' && ['N', 'S', 'E', 'W'].includes(subtype)) {
				// Doorway: RN, RS, RE, RW - place on floor
				grid[y][x] = CELL.FLOOR;
				if (!s.objects) s.objects = {};
				s.objects[`${x},${y}`] = { type: 'doorway', dir: subtype.toLowerCase() };
				console.log(`Doorway object at ${x},${y}: ${subtype.toLowerCase()}`);
			} else if (ch === 'BR') {
				// Bridge
				grid[y][x] = CELL.VOID; 
				s.props.bridgeTiles.push({ gx: x, gy: y });
			} else if (ch === 'LV') {
				// Lever
				grid[y][x] = CELL.FLOOR; 
				s.props.lever = { gx: x, gy: y };
			} else if (ch === 'KY') {
				// Key
				grid[y][x] = CELL.FLOOR; 
				s.items.push({ gx: x, gy: y, kind: 'key' });
			} else if (ch === 'PL') {
				// Player
				grid[y][x] = CELL.FLOOR; 
				s.player.gx = x; s.player.gy = y;
			} else {
				// Unknown code, default to void
				grid[y][x] = CELL.VOID;
				console.log(`Unknown tile code: ${ch} at ${x},${y}`);
			}
		} else {
			// Legacy single-character support (fallback)
			if (ch === '.') grid[y][x] = CELL.FLOOR;
			else if (ch === '#') grid[y][x] = CELL.WALLNORTH; // Default to north-facing wall
			else grid[y][x] = CELL.VOID;
		}
	}

	function updateBridgeState(s, on) {
		s.bridgeOn = on;
		for (const t of s.props.bridgeTiles) {
			s.grid[t.gy][t.gx] = on ? CELL.BRIDGE : CELL.VOID;
		}
		drawWorld(s);
	}

	function drawWorld(s) {
		// LAYER 1: Clear and draw floor tiles (bottom layer)
		for (const row of s.tileSprites) for (const sp of row) sp && sp.destroy();
		s.tileSprites = [];
		for (let gy = 0; gy < GRID_H; gy++) {
			const row = [];
			for (let gx = 0; gx < GRID_W; gx++) {
				const cell = s.grid[gy][gx];
				const p = gridToScreen(gx, gy, s.isoOrigin);
				if (cell === CELL.VOID) { row.push(null); continue; }
				const key = textureKeyForCell(s, cell, gx, gy);
				const sp = s.add.image(p.x, p.y, key).setOrigin(0.5, 0.5);
				applyTileSpriteAdjustments(s, sp, key);
				sp.setDepth(p.y + DEPTHS.floor); // Floor base depth
				row.push(sp);
			}
			s.tileSprites.push(row);
		}
		
		// LAYER 2: Hover texture (above floors, below everything else)
		if (s.hoverSprite && s.hoverSprite.visible) {
			s.hoverSprite.setDepth(s.hoverSprite.y + 1);
		}
		
		// LAYER 2: Items (on floor, before player)
		drawItems(s);
		
		// LAYER 3: Player (middle layer) 
		drawPlayer(s);
		
		// LAYER 4: Objects/Walls (top layer, in front of player)
		for (const sp of s.objectSprites) sp.destroy();
		s.objectSprites = [];
		if (s.objects) {
			for (const [coordKey, obj] of Object.entries(s.objects)) {
				const [gx, gy] = coordKey.split(',').map(Number);
				const p = gridToScreen(gx, gy, s.isoOrigin);
				const textureKey = `${obj.type}_${obj.dir}`;
				const fallbackKey = obj.type;
				const key = s.textures.exists(textureKey) ? textureKey : 
				           s.textures.exists(fallbackKey) ? fallbackKey : 'tile_door_closed';
				const objSprite = s.add.image(p.x, p.y, key).setOrigin(0.5, 0.5);
				applyTileSpriteAdjustments(s, objSprite, key);
				// Proper isometric depth ordering: walls render based on their actual visual position
				// In isometric view: higher Y = further back = should render behind player
				const playerY = s.player.gy;
				const playerX = s.player.gx;


				if (isSolidObject(obj))
				{
					if ((obj.dir === 'n' || obj.dir == 'w') && (gy == playerY && gx == playerX)) {
						objSprite.setDepth(p.y + DEPTHS.wall);
					} else {
						objSprite.setDepth(p.y);
					}
				}
				
				// Make walls semi-transparent when they might cover the player
				// Only when player is ON the same tile as the wall
				let shouldBeTransparent = false;

				if (isSolidObject(obj)) {
					if (obj.dir === 'n' || obj.dir === 'w')
					{
						// Check if player is on the same tile as the wall
						shouldBeTransparent = (playerY === gy && playerX === gx);
					}
					else if (obj.dir === 's')
					{
						shouldBeTransparent = (playerY === gy-1 && playerX === gx);
					}
					else
					{
						shouldBeTransparent = (playerY === gy && playerX === gx-1);
					}
				}

				if (shouldBeTransparent) {
					objSprite.setAlpha(0.6); // 60% opacity for better player visibility
				} else {
					objSprite.setAlpha(1.0); // Full opacity for other walls
				}
				s.objectSprites.push(objSprite);
			}
		}
		
		// Props: clear and redraw
		for (const sp of s.propSprites) sp.destroy();
		s.propSprites = [];
		
		// Legacy single lever (only if exists)
		if (s.props.lever) {
			const {gx, gy} = s.props.lever;
			const p = gridToScreen(gx, gy, s.isoOrigin);
			const lever = s.add.image(p.x, p.y - 10, s.textures.exists('lever_img') ? 'lever_img' : 'lever').setOrigin(0.5, 1.0);
			lever.setDepth(p.y + DEPTHS.lever);
			s.propSprites.push(lever);
		}
		
		// New ID-based levers
		if (s.props.levers) {
			s.props.levers.forEach(lever => {
				const p = gridToScreen(lever.gx, lever.gy, s.isoOrigin);
				const leverSprite = s.add.image(p.x, p.y - 10, s.textures.exists('lever_img') ? 'lever_img' : 'lever').setOrigin(0.5, 1.0);
				leverSprite.setDepth(p.y + DEPTHS.lever);
				
				// Add ID text if lever has an ID
				if (lever.id) {
					const idText = s.add.text(p.x + 8, p.y - 20, lever.id, {
						fontSize: '10px',
						fill: '#ffffff',
						stroke: '#000000',
						strokeThickness: 1
					});
					idText.setDepth(p.y + DEPTHS.lever + 1);
					s.propSprites.push(idText);
				}
				
				s.propSprites.push(leverSprite);
			});
		}
		
		// Legacy single door (only if exists)
		if (s.props.door) {
			const {gx, gy, open} = s.props.door;
			const p = gridToScreen(gx, gy, s.isoOrigin);
			const doorKey = open ? (s.textures.exists('door_open_img') ? 'door_open_img' : 'door_open_icon') : (s.textures.exists('door_closed_img') ? 'door_closed_img' : 'door_closed_icon');
			const doorIcon = s.add.image(p.x, p.y - 10, doorKey).setOrigin(0.5, 1.0);
			doorIcon.setDepth(p.y + DEPTHS.lever);
			s.propSprites.push(doorIcon);
		}
		
		// New ID-based door indicators
		if (s.props.doors) {
			s.props.doors.forEach(door => {
				const p = gridToScreen(door.gx, door.gy, s.isoOrigin);
				const doorKey = door.open ? 
					(s.textures.exists('door_open_img') ? 'door_open_img' : 'door_open_icon') : 
					(s.textures.exists('door_closed_img') ? 'door_closed_img' : 'door_closed_icon');
				const doorIcon = s.add.image(p.x, p.y - 10, doorKey).setOrigin(0.5, 1.0);
				doorIcon.setDepth(p.y + DEPTHS.lever);
				
				// Add ID text
				if (door.id) {
					const idText = s.add.text(p.x + 8, p.y - 20, door.id, {
						fontSize: '10px',
						fill: '#ffffff',
						stroke: '#000000',
						strokeThickness: 1
					});
					idText.setDepth(p.y + DEPTHS.lever + 1);
					s.propSprites.push(idText);
				}
				
				s.propSprites.push(doorIcon);
			});
		}
	}

	function drawItems(s) {
		for (const sp of s.itemSprites) sp.destroy();
		s.itemSprites = [];
		for (const it of s.items) {
			const p = gridToScreen(it.gx, it.gy, s.isoOrigin);
			const key = it.kind === 'key' ? (s.textures.exists('item_key_img') ? 'item_key_img' : 'item_key') : 'item';
			const sp = s.add.image(p.x, p.y - 6, key).setOrigin(0.5, 1.0);
			sp.setDepth(p.y + DEPTHS.item); // Items above floor, below player
			s.itemSprites.push(sp);
		}
	}

	function drawPlayer(s) {
		// Clear previous path markers
		for (const sp of s.pathSprites) sp.destroy();
		s.pathSprites = [];
		
		// Path markers
		for (const step of s.player.path) {
			const sp = gridToScreen(step.gx, step.gy, s.isoOrigin);
			const dot = s.add.image(sp.x, sp.y - 12, 'path_dot').setOrigin(0.5, 1.0);
			dot.setDepth(sp.y + DEPTHS.path);
			s.pathSprites.push(dot);
		}
		
		// Player sprite
		const p = gridToScreen(s.player.gx, s.player.gy, s.isoOrigin);
		if (!s.playerSprite) {
			if (s.textures.exists('player_sheet')) {
				s.playerSprite = s.add.sprite(p.x, p.y - 14, 'player_sheet', 0).setOrigin(0.5, 1.0);
				s.playerSprite.anims.play('idle_south');
				applyPlayerSpriteAdjustments(s);
			} else if (hasStaticDirectionalSprites(s)) {
				const key = getStaticKeyForDir(s, s.playerFacing);
				s.playerSprite = s.add.image(p.x, p.y - 14, key).setOrigin(0.5, 1.0);
				applyPlayerSpriteAdjustments(s);
			} else {
				// Fallback to our new animation system
				console.log('Using new animation system, starting with idle_south');
				s.playerSprite = s.add.sprite(p.x, p.y - 14, 'idle_south').setOrigin(0.5, 1.0);
				if (s.playerSprite.anims) {
					s.playerSprite.anims.play('idle_south');
					console.log('Playing idle_south animation');
				} else {
					console.log('No animations available on sprite');
				}
				applyPlayerSpriteAdjustments(s);
			}
		} else {
			s.playerSprite.setPosition(p.x, p.y - 14);
			applyPlayerSpriteAdjustments(s);
		}
		
		// Ensure player is always above floors by using a higher depth value
		// Floor tiles use depth p.y + 0, so player should be significantly higher
		s.playerSprite.setDepth(p.y + DEPTHS.player); // Increased from p.y + 5 to p.y + 10
	}

	function cellColor(s, cell, gx, gy) {
		if (cell === CELL.VOID) return COLORS.void;
		if (cell === CELL.FLOOR) return COLORS.floor;
		if (cell === CELL.WALL || cell === CELL.WALLNORTH || cell === CELL.WALLSOUTH || 
		    cell === CELL.WALLEAST || cell === CELL.WALLWEST) return COLORS.wall;
		if (cell === CELL.BRIDGE) return s.bridgeOn ? COLORS.bridge : COLORS.bridgeOff;
		return COLORS.floor;
	}

	function textureKeyForCell(s, cell, gx, gy) {
		if (cell === CELL.VOID) return 'tile_void';
		if (cell === CELL.FLOOR) return floorTextureFor(s, gx, gy);
		if (cell === CELL.WALL || cell === CELL.WALLNORTH || cell === CELL.WALLSOUTH || 
		    cell === CELL.WALLEAST || cell === CELL.WALLWEST) {
			return wallTextureFor(s, gx, gy);
		}
		if (cell === CELL.BRIDGE) return s.bridgeOn ? (s.textures.exists('tile_bridge_on_img') ? 'tile_bridge_on_img' : 'tile_bridge_on') : (s.textures.exists('tile_bridge_off_img') ? 'tile_bridge_off_img' : 'tile_bridge_off');
		return floorTextureFor(s, gx, gy);
	}

	function floorTextureFor(s, gx, gy) {
		// Check for directional floor override
		const ov = s.wallOverride && s.wallOverride[`${gx},${gy}`];
		if (ov && typeof ov === 'object' && ov.type === 'floor') {
			const textureKey = `floor_${ov.dir}`;
			if (s.textures.exists(textureKey)) return textureKey;
		}
		// Fallback to default floor
		return s.textures.exists('floor_default') ? 'floor_default' : 
		       s.textures.exists('tile_floor_img') ? 'tile_floor_img' : 'tile_floor';
	}

	function wallTextureFor(s, gx, gy) {
		const cell = s.grid[gy][gx];
		
		// For directional wall cells, use the direction directly
		if (cell === CELL.WALLNORTH) {
			return s.textures.exists('wall_n') ? 'wall_n' : 
			       s.textures.exists('tile_wall_n_img') ? 'tile_wall_n_img' : 'tile_wall';
		}
		if (cell === CELL.WALLSOUTH) {
			return s.textures.exists('wall_s') ? 'wall_s' : 
			       s.textures.exists('tile_wall_s_img') ? 'tile_wall_s_img' : 'tile_wall';
		}
		if (cell === CELL.WALLEAST) {
			return s.textures.exists('wall_e') ? 'wall_e' : 
			       s.textures.exists('tile_wall_e_img') ? 'tile_wall_e_img' : 'tile_wall';
		}
		if (cell === CELL.WALLWEST) {
			return s.textures.exists('wall_w') ? 'wall_w' : 
			       s.textures.exists('tile_wall_w_img') ? 'tile_wall_w_img' : 'tile_wall';
		}
		
		// For legacy CELL.WALL, use old logic
		// Respect explicit overrides from level file
		const ov = s.wallOverride && s.wallOverride[`${gx},${gy}`];
		if (ov && typeof ov === 'object') {
			// New format: {type: 'wall', dir: 'n'}
			const textureKey = `${ov.type}_${ov.dir}`;
			if (s.textures.exists(textureKey)) return textureKey;
		} else if (typeof ov === 'string') {
			// Legacy format: 'n', 's', 'e', 'w'
			const dirKey = {
				n: 'tile_wall_n_img', s: 'tile_wall_s_img', e: 'tile_wall_e_img', w: 'tile_wall_w_img'
			}[ov];
			if (dirKey && s.textures.exists(dirKey)) return dirKey;
		}
		const nVoid = !isSolid(s, gx, gy - 1);
		const sVoid = !isSolid(s, gx, gy + 1);
		const eVoid = !isSolid(s, gx + 1, gy);
		const wVoid = !isSolid(s, gx - 1, gy);
		// Corners first (two orthogonal open sides)
		if (nVoid && eVoid && s.textures.exists('tile_wall_corner_ne_img')) return 'tile_wall_corner_ne_img';
		if (nVoid && wVoid && s.textures.exists('tile_wall_corner_nw_img')) return 'tile_wall_corner_nw_img';
		if (sVoid && eVoid && s.textures.exists('tile_wall_corner_se_img')) return 'tile_wall_corner_se_img';
		if (sVoid && wVoid && s.textures.exists('tile_wall_corner_sw_img')) return 'tile_wall_corner_sw_img';
		// Prefer facing the largest open area; priority N,S,E,W
		if (nVoid && s.textures.exists('tile_wall_n_img')) return 'tile_wall_n_img';
		if (sVoid && s.textures.exists('tile_wall_s_img')) return 'tile_wall_s_img';
		if (eVoid && s.textures.exists('tile_wall_e_img')) return 'tile_wall_e_img';
		if (wVoid && s.textures.exists('tile_wall_w_img')) return 'tile_wall_w_img';
		// Fallback to any provided wall image or generated wall
		return (s.textures.exists('tile_wall_img') ? 'tile_wall_img' : 'tile_wall');
	}

	function doorTextureFor(s, gx, gy, doorType = 'door_closed') {
		// Check for directional door override
		const ov = s.wallOverride && s.wallOverride[`${gx},${gy}`];
		if (ov && typeof ov === 'object') {
			const textureKey = `${ov.type}_${ov.dir}`;
			if (s.textures.exists(textureKey)) return textureKey;
			// If specific directional texture doesn't exist, use the door type
			doorType = ov.type;
		}
		// Fallback to generated textures based on door type
		if (s.textures.exists(doorType)) return doorType;
		// Final fallback
		return doorType === 'door_open' ? 'tile_floor' : 'tile_door_closed';
	}

	function isSolid(s, gx, gy) {
		if (!inBounds(gx, gy)) {
			console.log(`Out of bounds at ${gx},${gy}`);
			return false;
		}
		const c = s.grid[gy][gx];
		
		// Check base layer first
		if (c === CELL.VOID || (c === CELL.BRIDGE && !s.bridgeOn)) return false;
		
		// Legacy wall types still block movement completely
		if (c === CELL.WALL || c === CELL.WALLNORTH || c === CELL.WALLSOUTH || 
		    c === CELL.WALLEAST || c === CELL.WALLWEST) {
			console.log(`Wall blocks movement at ${gx},${gy}`);
			return true;
		}
		
		// Legacy door system
		if (c === CELL.DOOR_CLOSED && s.props.door && !s.props.door.open) return true;
		if (c === CELL.DOOR_OPEN && s.props.door && s.props.door.open) return false;
		
		// Check new ID-based doors
		if (s.props.doors) {
			const doorAtPos = s.props.doors.find(door => door.gx === gx && door.gy === gy);
			if (doorAtPos) {
				// Door is solid if it's closed
				return !doorAtPos.open;
			}
		}
		
		// Floor tiles with directional wall objects are walkable
		// The walls only block movement across edges, not standing on the tile
		console.log(`Tile ${gx},${gy} is walkable`);
		return false;
	}

	function isSolidObject(obj) {
		return ['wall', 'half_wall', 'window', 'door_closed', 'door_open', 'doorway'].includes(obj.type);
	}

	function canMoveBetween(s, fromGx, fromGy, toGx, toGy) {
		// Check if movement between two adjacent tiles is blocked by walls/doors
		if (!inBounds(fromGx, fromGy) || !inBounds(toGx, toGy)) return false;
		if (isSolid(s, toGx, toGy)) return false;
		
		const dx = toGx - fromGx;
		const dy = toGy - fromGy;
		
		// Check directional walls that block movement between tiles
		const fromCell = s.grid[fromGy][fromGx];
		const toCell = s.grid[toGy][toGx];
		
		// Check if movement is blocked by directional wall cells (legacy support)
		if (dx === 1) {
			// Moving east: check for east-facing wall at source or west-facing wall at destination
			if (fromCell === CELL.WALLEAST) {
				console.log(`Movement east blocked by east-facing wall at ${fromGx},${fromGy}`);
				return false;
			}
			if (toCell === CELL.WALLWEST) {
				console.log(`Movement east blocked by west-facing wall at ${toGx},${toGy}`);
				return false;
			}
		} else if (dx === -1) {
			// Moving west: check for west-facing wall at source or east-facing wall at destination
			if (fromCell === CELL.WALLWEST) {
				console.log(`Movement west blocked by west-facing wall at ${fromGx},${fromGy}`);
				return false;
			}
			if (toCell === CELL.WALLEAST) {
				console.log(`Movement west blocked by east-facing wall at ${toGx},${toGy}`);
				return false;
			}
		} else if (dy === 1) {
			// Moving south: check for south-facing wall at source or north-facing wall at destination
			if (fromCell === CELL.WALLSOUTH) {
				console.log(`Movement south blocked by south-facing wall at ${fromGx},${fromGy}`);
				return false;
			}
			if (toCell === CELL.WALLNORTH) {
				console.log(`Movement south blocked by north-facing wall at ${toGx},${toGy}`);
				return false;
			}
		} else if (dy === -1) {
			// Moving north: check for north-facing wall at source or south-facing wall at destination
			if (fromCell === CELL.WALLNORTH) {
				console.log(`Movement north blocked by north-facing wall at ${fromGx},${fromGy}`);
				return false;
			}
			if (toCell === CELL.WALLSOUTH) {
				console.log(`Movement north blocked by south-facing wall at ${toGx},${toGy}`);
				return false;
			}
		}
		
		// Check for object-based directional walls
		// Key insight: A wall blocks movement in the OPPOSITE direction it faces
		// West-facing wall (w) blocks EASTWARD movement, not westward
		const checkWallBlocks = (gx, gy, movementDirection) => {
			const obj = s.objects && s.objects[`${gx},${gy}`];
			if (!obj) return false;
			
			const solidTypes = ['door_closed', 'wall', 'half_wall', 'window'];
			if (!solidTypes.includes(obj.type)) return false;
			
			// Map wall direction to the movement it blocks
			const blockingMap = {
				'w': 'east',   // West-facing wall blocks eastward movement
				'e': 'west',   // East-facing wall blocks westward movement  
				'n': 'south',  // North-facing wall blocks southward movement
				's': 'north'   // South-facing wall blocks northward movement
			};
			
			return blockingMap[obj.dir] === movementDirection;
		};
		
		// Check if movement is blocked by walls at source tile
		if (dx === 1) {
			// Moving east: check for west-facing wall at source
			if (checkWallBlocks(fromGx, fromGy, 'east')) {
				console.log(`Movement east blocked by west-facing wall at ${fromGx},${fromGy}`);
				return false;
			}
			// Also check for east-facing wall at destination that blocks entry from west
			if (checkWallBlocks(toGx, toGy, 'west')) {
				console.log(`Movement east blocked by east-facing wall at destination ${toGx},${toGy}`);
				return false;
			}
		} else if (dx === -1) {
			// Moving west: check for east-facing wall at source
			if (checkWallBlocks(fromGx, fromGy, 'west')) {
				console.log(`Movement west blocked by east-facing wall at ${fromGx},${fromGy}`);
				return false;
			}
			// Also check for west-facing wall at destination that blocks entry from east
			if (checkWallBlocks(toGx, toGy, 'east')) {
				console.log(`Movement west blocked by west-facing wall at destination ${toGx},${toGy}`);
				return false;
			}
		} else if (dy === 1) {
			// Moving south: check for north-facing wall at source
			if (checkWallBlocks(fromGx, fromGy, 'south')) {
				console.log(`Movement south blocked by north-facing wall at ${fromGx},${fromGy}`);
				return false;
			}
			// Also check for south-facing wall at destination that blocks entry from north
			if (checkWallBlocks(toGx, toGy, 'north')) {
				console.log(`Movement south blocked by south-facing wall at destination ${toGx},${toGy}`);
				return false;
			}
		} else if (dy === -1) {
			// Moving north: check for south-facing wall at source
			if (checkWallBlocks(fromGx, fromGy, 'north')) {
				console.log(`Movement north blocked by south-facing wall at ${fromGx},${fromGy}`);
				return false;
			}
			// Also check for north-facing wall at destination that blocks entry from south
			if (checkWallBlocks(toGx, toGy, 'south')) {
				console.log(`Movement north blocked by north-facing wall at destination ${toGx},${toGy}`);
				return false;
			}
		}
		
		return true;
	}

	function inBounds(gx, gy) {
		return gx >= 0 && gy >= 0 && gx < GRID_W && gy < GRID_H;
	}

	function gridToScreen(gx, gy, origin) {
		const x = (gx - gy) * (TILE_W / 2) + origin.x;
		const y = (gx + gy) * (TILE_H / 2) + origin.y;
		return { x, y };
	}

	function screenToGrid(x, y, origin) {
		// Adjust picking Y to account for bottom-aligned tiles (originY = 1.0)
		const pickOffsetY = (scene && scene.assetMap && typeof scene.assetMap.tile_pick_offsetY === 'number') ? scene.assetMap.tile_pick_offsetY : (TILE_H / 2);
		const dx = x - origin.x;
		const dy = (y + pickOffsetY) - origin.y;
		const fx = dx / (TILE_W / 2);
		const fy = dy / (TILE_H / 2);
		const rawGx = (fx + fy) / 2;
		const rawGy = (fy - fx) / 2;
		// Round to nearest cell center for robust picking
		const gx = Math.round(rawGx);
		const gy = Math.round(rawGy);
		return { gx, gy };
	}

	function drawDiamond(g, x, y, w, h, color) {}

	function drawDot(g, x, y, r, color) {}

	function isWalkable(s, gx, gy) {
		// Use the new isSolid function which handles objects properly
		return !isSolid(s, gx, gy);
	}

	function bfsPath(s, start, goal) {
		if (!isWalkable(s, goal.gx, goal.gy)) return null;
		const q = [];
		const seen = new Set();
		const parent = new Map();
		const key = (x,y) => `${x},${y}`;
		q.push(start);
		seen.add(key(start.gx, start.gy));
		const dirs = [ [1,0], [-1,0], [0,1], [0,-1] ];
		while (q.length) {
			const cur = q.shift();
			if (cur.gx === goal.gx && cur.gy === goal.gy) break;
			for (const [dx,dy] of dirs) {
				const nx = cur.gx + dx, ny = cur.gy + dy;
				// Use canMoveBetween to check directional wall blocking
				if (!canMoveBetween(s, cur.gx, cur.gy, nx, ny)) continue;
				const k = key(nx, ny);
				if (seen.has(k)) continue;
				seen.add(k);
				parent.set(k, cur);
				q.push({ gx: nx, gy: ny });
			}
		}
		const endKey = key(goal.gx, goal.gy);
		if (!seen.has(endKey)) return null;
		const path = [];
		let cur = { gx: goal.gx, gy: goal.gy };
		while (!(cur.gx === start.gx && cur.gy === start.gy)) {
			path.push(cur);
			const p = parent.get(key(cur.gx, cur.gy));
			if (!p) break;
			cur = { gx: p.gx, gy: p.gy };
		}
		path.reverse();
		return path;
	}

	function bfsPath(s, start, end) {
		console.log(`Finding path from ${start.gx},${start.gy} to ${end.gx},${end.gy}`);
		
		if (isSolid(s, end.gx, end.gy)) {
			console.log(`Target ${end.gx},${end.gy} is solid, no path`);
			return null;
		}
		
		const queue = [{ gx: start.gx, gy: start.gy, path: [] }];
		const visited = new Set();
		visited.add(`${start.gx},${start.gy}`);
		
		while (queue.length > 0) {
			const current = queue.shift();
			
			if (current.gx === end.gx && current.gy === end.gy) {
				console.log(`Path found with ${current.path.length} steps`);
				return current.path;
			}
			
			// Check 4 directions
			const neighbors = [
				{ gx: current.gx, gy: current.gy - 1 }, // up
				{ gx: current.gx + 1, gy: current.gy }, // right  
				{ gx: current.gx, gy: current.gy + 1 }, // down
				{ gx: current.gx - 1, gy: current.gy }  // left
			];
			
			for (const neighbor of neighbors) {
				const key = `${neighbor.gx},${neighbor.gy}`;
				if (visited.has(key) || !canMoveBetween(s, current.gx, current.gy, neighbor.gx, neighbor.gy)) {
					continue;
				}
				
				visited.add(key);
				queue.push({
					gx: neighbor.gx,
					gy: neighbor.gy,
					path: [...current.path, neighbor]
				});
			}
		}
		
		console.log(`No path found from ${start.gx},${start.gy} to ${end.gx},${end.gy}`);
		return null;
	}

	function movePlayerTo(s, gx, gy) {
		const path = bfsPath(s, { gx: s.player.gx, gy: s.player.gy }, { gx, gy });
		if (!path) return;
		s.player.path = path;
		drawWorld(s);
	}

	function stepPlayer(s, speed) {
		if (!s || !s.player) return;
		const path = s.player.path;
		if (!path || path.length === 0) return;
		
		// Move one step per fixed interval
		if (!s._lastStepTime) s._lastStepTime = 0;
		const stepIntervalMs = 16; // 60 FPS for smooth movement
		const now = s.time.now;
		if (now - s._lastStepTime < stepIntervalMs) return;
		s._lastStepTime = now;
		
		// Get current target
		const target = path[0];
		if (!target) return;
		
		// Calculate movement towards target
		const targetX = target.gx;
		const targetY = target.gy;
		const currentX = s.player.gx;
		const currentY = s.player.gy;
		
		// Linear movement speed (tiles per second)
		const moveSpeed = speed; // Constant speed throughout movement
		
		// Calculate direction vector
		const dx = targetX - currentX;
		const dy = targetY - currentY;
		
		// Calculate distance to target
		const distance = Math.sqrt(dx * dx + dy * dy);
		
		// If we're close enough to the target, snap to it and move to next path step
		const threshold = 0.1; // How close we need to be to consider "arrived"
		if (distance < threshold) {
			// Arrived at target tile
			s.player.gx = targetX;
			s.player.gy = targetY;
			path.shift(); // Remove completed step
			
			// Update player facing direction
			if (path.length > 0) {
				const nextTarget = path[0];
				const nextDx = nextTarget.gx - targetX;
				const nextDy = nextTarget.gy - targetY;
				setPlayerAnimByDir(s, nextDx, nextDy, true);
			} else {
				// Path complete, stop moving
				setPlayerAnimByDir(s, 0, 0, false);
			}
			
			drawWorld(s);
			return;
		}
		
		// Normalize direction vector and apply constant speed
		const normalizedDx = dx / distance;
		const normalizedDy = dy / distance;
		
		// Move at constant speed towards target
		const moveDistance = moveSpeed * (stepIntervalMs / 1000);
		const moveX = normalizedDx * moveDistance;
		const moveY = normalizedDy * moveDistance;
		
		// Update player position
		s.player.gx += moveX;
		s.player.gy += moveY;
		
		// Update player facing direction based on movement
		if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
			setPlayerAnimByDir(s, dx, dy, true);
		}
		
		// Redraw world to show smooth movement
		drawWorld(s);
	}

	function createPlayerAnimations(s) {
		const hasAnim = (key) => s.anims.exists(key);

		const mapping = s.cache.json.get('asset_map') || {};
    
		// Support for new player_sheet structure with walk/idle animations
		if (mapping.player_sheet && typeof mapping.player_sheet === 'object') {
			const directions = ['north', 'south', 'east', 'west'];
			
			// Create walk animations
			if (mapping.player_sheet.walk) {
				const walk = mapping.player_sheet.walk;
				const numFrames = walk.num_frames || 4;
				const frameRate = walk.frame_rate || 8;
				
				for (const dir of directions) {
					if (walk[dir]) {
						const walkKey = `walk_${dir}`;
						if (!s.anims.exists(walkKey)) {
							const frames = [];
							for (let i = 0; i < numFrames; i++) {
								// For individual PNG files, construct the frame path
								const framePath = walk[dir].replace('.png', `${i}.png`);
								console.log(`Creating frame for ${walkKey}: ${framePath}`);
								frames.push({ key: framePath });
							}
							s.anims.create({
								key: walkKey,
								frames: frames,
								frameRate: frameRate,
								repeat: -1
							});
						}
					}
				}
			}
			
			// Create idle animations
			if (mapping.player_sheet.idle) {
				const idle = mapping.player_sheet.idle;
				const numFrames = idle.num_frames || 4;
				const frameRate = idle.frame_rate || 4;
				
				for (const dir of directions) {
					if (idle[dir]) {
						const idleKey = `idle_${dir}`;
						if (!s.anims.exists(idleKey)) {
							const frames = [];
							for (let i = 0; i < numFrames; i++) {
								// For individual PNG files, construct the frame path
								const framePath = idle[dir].replace('.png', `${i}.png`);
								console.log(`Creating frame for ${idleKey}: ${framePath}`);
								frames.push({ key: framePath });
							}
							s.anims.create({
								key: idleKey,
								frames: frames,
								frameRate: frameRate,
								repeat: -1
							});
						}
					}
				}
			}

			console.log(s.anims);
			return;
		}

		else if (mapping.player_sheet_dirs && typeof mapping.player_sheet_dirs === 'object') {
			const dirs = ['up','right','down','left'];
			for (const dir of dirs) {
				const conf = mapping.player_sheet_dirs[dir] || {};
				const frames = conf.frames || conf.framesPerDir || 4;
				const base = `player_sheet_${dir}`;
				if (!s.textures.exists(base)) continue;
				
				// Idle animation
				const idleKey = `idle_${dir}`;
				if (!hasAnim(idleKey)) {
					s.anims.create({ 
						key: idleKey, 
						frames: s.anims.generateFrameNumbers(base, { start: 0, end: frames - 1 }), 
						frameRate: 4, 
						repeat: -1 
					});
				}
				
				// Walk animation
				const walkKey = `walk_${dir}`;
				if (!hasAnim(walkKey)) {
					s.anims.create({ 
						key: walkKey, 
						frames: s.anims.generateFrameNumbers(base, { start: 0, end: frames - 1 }), 
						frameRate: 8, 
						repeat: -1 
					});
				}
			}
		}
	}

	function setPlayerAnimByDir(s, dx, dy, moving) {
		if (!s.playerSprite) return;
		let dir = s.playerFacing;
		if (dx === 1) dir = 'right';
		else if (dx === -1) dir = 'left';
		else if (dy === 1) dir = 'down';
		else if (dy === -1) dir = 'up';
		s.playerFacing = dir;
		
		// Map game directions to mapping.json directions
		const dirMap = {
			'up': 'north',
			'right': 'east', 
			'down': 'south',
			'left': 'west'
		};
		
		const mappedDir = dirMap[dir];
		
		if (s.playerSprite.anims) {
			const key = moving ? `walk_${mappedDir}` : `idle_${mappedDir}`;
			console.log(`Playing animation: ${key}`);
			if (s.playerSprite.anims.currentAnim?.key !== key) {
				s.playerSprite.anims.play(key, true);
			}
		} else if (hasStaticDirectionalSprites(s)) {
			const texKey = getStaticKeyForDir(s, dir);
			if (s.playerSprite.texture.key !== texKey) {
				s.playerSprite.setTexture(texKey);
				applyPlayerSpriteAdjustments(s);
			}
		}
	}

	function hasStaticDirectionalSprites(s) {
		return s.textures.exists('player_static_up') && s.textures.exists('player_static_right') && s.textures.exists('player_static_down') && s.textures.exists('player_static_left');
	}

	function getStaticKeyForDir(s, dir) {
		if (dir === 'up') return 'player_static_up';
		if (dir === 'right') return 'player_static_right';
		if (dir === 'left') return 'player_static_left';
		return 'player_static_down';
	}

	function applyPlayerSpriteAdjustments(s) {
		if (!s.playerSprite) return;
		const amap = s.assetMap || {};
		const targetWidth = (typeof amap.player_targetWidth === 'number' ? amap.player_targetWidth : Math.round(TILE_W * 0.9));
		const originY = (typeof amap.player_originY === 'number' ? amap.player_originY : 1.0);
		const offsetY = (typeof amap.player_offsetY === 'number' ? amap.player_offsetY : -4);
		const texImg = s.playerSprite.texture && s.playerSprite.texture.getSourceImage ? s.playerSprite.texture.getSourceImage() : null;
		if (texImg && texImg.width) {
			const scale = targetWidth / texImg.width;
			s.playerSprite.setScale(scale);
		} else {
			s.playerSprite.displayWidth = targetWidth;
			s.playerSprite.scaleY = s.playerSprite.scaleX;
		}
		s.playerSprite.setOrigin(0.5, originY);
		const p = gridToScreen(s.player.gx, s.player.gy, s.isoOrigin);
		s.playerSprite.y = p.y - 14 + offsetY;
	}

	function queueMoveThenInteract(s, gx, gy, item, prop) {
		// If clicked adjacent, interact immediately; else move to that tile first
		const isAdjacent = Math.abs(s.player.gx - gx) + Math.abs(s.player.gy - gy) === 1 || (s.player.gx === gx && s.player.gy === gy);
		if (!isWalkable(s, gx, gy)) {
			// You can still interact with props/items on non-walkable tiles if adjacent
			if (!isAdjacent) return;
		}
		if (isAdjacent) {
			if (item) pickupItem(s, item);
			if (prop) interactProp(s, prop);
			return;
		}
		s.player.pendingAction = { type: 'interact', target: { gx, gy, item, prop } };
		movePlayerTo(s, gx, gy);
	}

	function executePendingAction(s) {
		const pa = s.player.pendingAction;
		s.player.pendingAction = null;
		if (!pa || pa.type !== 'interact') return;
		const { gx, gy, item, prop } = pa.target;
		if (item) {
			const found = findItemAt(s, gx, gy);
			if (found) pickupItem(s, found);
		}
		if (prop) {
			const again = findPropAt(s, gx, gy);
			if (again) interactProp(s, again);
		}
	}

	function findItemAt(s, gx, gy) {
		return s.items.find(it => it.gx === gx && it.gy === gy) || null;
	}

	function removeItemAt(s, gx, gy) {
		s.items = s.items.filter(it => !(it.gx === gx && it.gy === gy));
	}

	function findPropAt(s, gx, gy) {
		const { door, lever, doors, levers } = s.props;
		
		// Check legacy single door
		if (door && door.gx === gx && door.gy === gy) return { kind: 'door', ref: door };
		
		// Check legacy single lever
		if (lever && lever.gx === gx && lever.gy === gy) return { kind: 'lever', ref: lever };
		
		// Check new ID-based doors
		if (doors) {
			const foundDoor = doors.find(d => d.gx === gx && d.gy === gy);
			if (foundDoor) return { kind: 'door', ref: foundDoor };
		}
		
		// Check new ID-based levers
		if (levers) {
			const foundLever = levers.find(l => l.gx === gx && l.gy === gy);
			if (foundLever) return { kind: 'lever', ref: foundLever };
		}
		
		return null;
	}

	function pickupItem(s, item) {
		if (!item) return;
		if (s.inventory) {
			// Drop current inventory to ground
			s.items.push({ gx: item.gx, gy: item.gy, kind: s.inventory.kind });
		}
		// Pick the new one and remove from world
		s.inventory = { kind: item.kind };
		removeItemAt(s, item.gx, item.gy);
		drawWorld(s); // Redraw everything including items
		updateHUD(s);
	}

	function interactProp(s, prop) {
		if (prop.kind === 'lever') {
			// Handle ID-based lever system
			if (prop.ref.id) {
				// Find all doors with matching ID
				const connectedDoors = s.props.doors.filter(door => door.id === prop.ref.id);
				if (connectedDoors.length > 0) {
					// Toggle all connected doors
					connectedDoors.forEach(door => {
						door.open = !door.open;
						console.log(`Lever ${prop.ref.id}: Door at ${door.gx},${door.gy} ${door.open ? 'opened' : 'closed'}`);
					});
					drawWorld(s); // Redraw to show door state changes
					return;
				}
			}
			
			// Fall back to legacy bridge system for non-ID levers
			updateBridgeState(s, !s.bridgeOn);
			return;
		}
		
		if (prop.kind === 'door') {
			// Handle ID-based doors
			if (prop.ref.id && prop.ref.open) {
				return; // Door is already open
			}
			
			// Legacy door system - needs key
			if (!prop.ref.id || (s.props.door && prop.ref === s.props.door)) {
				if (prop.ref.open) return;
				// Needs key in inventory
				if (s.inventory && s.inventory.kind === 'key') {
					prop.ref.open = true;
					// consume key
					s.inventory = null;
					updateHUD(s);
					drawWorld(s);
				}
			}
		}
	}

	function updateHUD(s) {
		const hudInv = document.getElementById('hud-inv');
		if (!hudInv) return;
		hudInv.textContent = `Inventory: ${s.inventory ? s.inventory.kind : '(empty)'}`;
	}

	function updateIsoOrigin(s) {
		const cam = s.cameras.main;
		const cx = cam.width / 2;
		const cy = 120; // top padding
		// center the diamond map roughly
		s.isoOrigin.set(cx - (GRID_W * TILE_W) / 4 + (GRID_H * TILE_W) / 4, cy);
	}

	function applyTileSpriteAdjustments(s, sp, key) {
		// Scale by width only to preserve aspect ratio (avoids squishing tall 256x512 tiles)
		const tex = sp.texture && sp.texture.getSourceImage ? sp.texture.getSourceImage() : null;
		if (tex && tex.width) {
			const scale = TILE_W / tex.width;
			sp.setScale(scale);
		} else {
			// Fallback: set display width only
			sp.displayWidth = TILE_W;
			sp.scaleY = sp.scaleX;
		}
		const amap = s.assetMap || {};
		const originYGlobal = (amap.tile_originY !== undefined) ? amap.tile_originY : 1.0;
		const offsetYGlobal = (amap.tile_offsetY !== undefined) ? amap.tile_offsetY : 0;
		let originY = originYGlobal;
		let offsetY = offsetYGlobal;
		// Per-type overrides
		if (key === 'tile_floor_img' || key === 'tile_floor') {
			if (amap.tile_floor_originY !== undefined) originY = amap.tile_floor_originY;
			if (amap.tile_floor_offsetY !== undefined) offsetY = amap.tile_floor_offsetY;
			// No cropping by default; can be added back via mapping if desired
		}
		sp.setOrigin(0.5, originY);
		sp.y += offsetY;
	}

	function cropSpriteToRect(sp, rect) {
		// rect: {x,y,width,height} in source texture pixels
		const tex = sp.texture;
		if (!tex || !tex.hasSource) return;
		const src = tex.getSourceImage();
		if (!src) return;
		const r = rect;
		sp.setCrop(r.x || 0, r.y || 0, r.width || src.width, r.height || src.height);
	}

	function createTextures(s) {
		// Helper to make a diamond tile texture
		function makeDiamond(key, fill, stroke=0x000000) {
			const g = s.add.graphics();
			g.lineStyle(2, stroke, 0.25);
			g.fillStyle(fill, 1);
			g.beginPath();
			g.moveTo(TILE_W/2, 0);
			g.lineTo(TILE_W, TILE_H/2);
			g.lineTo(TILE_W/2, TILE_H);
			g.lineTo(0, TILE_H/2);
			g.closePath();
			g.fillPath();
			g.strokePath();
			g.generateTexture(key, TILE_W, TILE_H);
			g.destroy();
		}
		function makeCircle(key, radius, color) {
			const size = radius * 2 + 4;
			const g = s.add.graphics();
			g.fillStyle(color, 1);
			g.fillCircle(size/2, size/2, radius);
			g.generateTexture(key, size, size);
			g.destroy();
		}
		function makeRect(key, w, h, color) {
			const g = s.add.graphics();
			g.fillStyle(color, 1);
			g.fillRoundedRect(0, 0, w, h, 3);
			g.generateTexture(key, w, h);
			g.destroy();
		}
		makeDiamond('tile_void', COLORS.void);
		makeDiamond('tile_floor', COLORS.floor);
		makeDiamond('tile_wall', COLORS.wall);
		
		// Floor types (basic and directional)
		makeDiamond('floor_default', COLORS.floor);
		makeDiamond('floor_n', 0x3a4f5a); // Slightly darker blue floor
		makeDiamond('floor_s', 0x4a5f3a); // Slightly darker green floor
		makeDiamond('floor_e', 0x5a3f4a); // Slightly darker purple floor
		makeDiamond('floor_w', 0x5f4a3a); // Slightly darker brown floor
		// Wall types with different colors for each direction
		makeDiamond('wall_n', 0xff4444); // Red for North walls
		makeDiamond('wall_s', 0x44ff44); // Green for South walls
		makeDiamond('wall_e', 0x4444ff); // Blue for East walls  
		makeDiamond('wall_w', 0xffff44); // Yellow for West walls
		
		// Half walls (lighter versions)
		makeDiamond('half_wall_n', 0xff8888);
		makeDiamond('half_wall_s', 0x88ff88);
		makeDiamond('half_wall_e', 0x8888ff);
		makeDiamond('half_wall_w', 0xffff88);
		
		// Windows (pastel versions)
		makeDiamond('window_n', 0xffaaaa);
		makeDiamond('window_s', 0xaaffaa);
		makeDiamond('window_e', 0xaaaaff);
		makeDiamond('window_w', 0xffffaa);
		
		// Door types (different shades for each state)
		makeDiamond('door_closed_n', 0x881111); // Dark red for closed doors
		makeDiamond('door_closed_s', 0x118811); // Dark green
		makeDiamond('door_closed_e', 0x111188); // Dark blue
		makeDiamond('door_closed_w', 0x888811); // Dark yellow
		
		makeDiamond('door_open_n', 0xcc4444); // Lighter red for open doors
		makeDiamond('door_open_s', 0x44cc44); // Lighter green
		makeDiamond('door_open_e', 0x4444cc); // Lighter blue
		makeDiamond('door_open_w', 0xcccc44); // Lighter yellow
		
		makeDiamond('doorway_n', 0xaa8888); // Gray-red for doorways
		makeDiamond('doorway_s', 0x88aa88); // Gray-green
		makeDiamond('doorway_e', 0x8888aa); // Gray-blue
		makeDiamond('doorway_w', 0xaaaa88); // Gray-yellow
		
		// Fallback door textures
		makeDiamond('door_closed', 0x663333);
		makeDiamond('door_open', 0x996666);
		makeDiamond('doorway', 0x999999);
		makeDiamond('tile_bridge_on', COLORS.bridge);
		makeDiamond('tile_bridge_off', COLORS.bridgeOff);
		makeDiamond('tile_door_closed', COLORS.doorClosed);
		makeRect('lever', 10, 14, COLORS.lever);
		makeRect('door_closed_icon', 12, 16, COLORS.doorClosed);
		makeRect('door_open_icon', 12, 16, COLORS.doorOpen);
		makeCircle('player', 8, COLORS.player);
		makeCircle('path_dot', 3, COLORS.path);
		// Hover outline diamond
		(function() {
			const g = s.add.graphics();
			g.lineStyle(2, 0xffffff, 0.9);
			g.beginPath();
			g.moveTo(TILE_W/2, 0);
			g.lineTo(TILE_W, TILE_H/2);
			g.lineTo(TILE_W/2, TILE_H);
			g.lineTo(0, TILE_H/2);
			g.closePath();
			g.strokePath();
			g.generateTexture('tile_hover', TILE_W, TILE_H);
			g.destroy();
		})();
		// simple key shape
		(function() {
			const w = 16, h = 8;
			const g = s.add.graphics();
			g.fillStyle(COLORS.key, 1);
			g.fillCircle(5, 4, 3);
			g.fillRect(8, 3, 8, 2);
			g.fillRect(14, 2, 2, 4);
			g.generateTexture('item_key', w, h);
			g.destroy();
		})();
	}

	// Scan assets/levels/ folder for available level files
	function scanAvailableLevels() {
		const levelSelect = document.getElementById('levelSelect');
		const loadBtn = document.getElementById('loadLevelBtn');
		
		if (!levelSelect) return;
		
		// Try to fetch directory listing - this depends on server setup
		// Fallback: try common level files
		const commonLevels = ['level1.txt', 'level2.txt', 'level3.txt', 'level4.txt', 'level5.txt'];
		
		levelSelect.innerHTML = '<option value="">Select Level...</option>';
		
		// Test each common level file
		Promise.all(commonLevels.map(filename => 
			fetch(`assets/levels/${filename}`, { method: 'HEAD' })
				.then(response => response.ok ? filename : null)
				.catch(() => null)
		)).then(results => {
			const availableLevels = results.filter(Boolean);
			
			availableLevels.forEach(filename => {
				const option = document.createElement('option');
				option.value = filename;
				option.textContent = filename.replace('.txt', '').toUpperCase();
				levelSelect.appendChild(option);
			});
			
			// Set current level as selected
			const currentLevel = scene?.assetMap?.level_file;
			if (currentLevel) {
				const currentFilename = currentLevel.split('/').pop();
				levelSelect.value = currentFilename;
			}
		});
		
		// Add load button functionality
		if (loadBtn) {
			loadBtn.onclick = () => {
				const selectedLevel = levelSelect.value;
				if (selectedLevel && scene) {
					loadSelectedLevel(selectedLevel);
				}
			};
		}
	}
	
	// Load the selected level
	function loadSelectedLevel(filename) {
		const levelPath = `assets/levels/${filename}`;
		console.log(`Loading selected level: ${levelPath}`);
		
		// Update asset map
		scene.assetMap.level_file = levelPath;
		
		// Clear existing level data from cache
		if (scene.cache.text.exists('level_file')) {
			scene.cache.text.remove('level_file');
		}
		
		// Load the new level file with a unique key to avoid caching issues
		const levelKey = `level_file_${Date.now()}`;
		scene.load.text(levelKey, levelPath);
		scene.load.once('complete', () => {
			console.log(`Level ${filename} loaded, recreating world...`);
			
			// Temporarily override the cache key for level loading
			const originalLevelData = scene.cache.text.get(levelKey);
			scene.cache.text.add('level_file', originalLevelData);
			
			// Recreate the level
			const grid = loadLevelFromText(scene, levelPath);
			scene.grid = grid;
			drawWorld(scene);
			
			// Update dropdown selection
			const levelSelect = document.getElementById('levelSelect');
			if (levelSelect) {
				levelSelect.value = filename;
			}
		});
		scene.load.start();
	}

	window.addEventListener('load', () => {
		game = new Phaser.Game(config);
	});
})();


