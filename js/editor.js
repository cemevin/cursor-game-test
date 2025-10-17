// Isometric Puzzle Level Editor
// Uses same rendering logic as the game for identical visual output

(function() {
	// Constants from game.js
	const TILE_W = 64;
	const TILE_H = 32;
	let GRID_W = 11;
	let GRID_H = 11;

	const DEPTHS = {
		floor: 0,
		player: 10,
		wall: 15,
		item: 3,
		lever: 2,
		hover: 1
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

	// Tile definitions organized by category
	const TILE_CATEGORIES = {
		'Basic': {
			' ': { name: 'Void', color: COLORS.void, char: ' ' },
			'.': { name: 'Floor', color: COLORS.floor, char: '.' }
		},
		'Walls': {
			'#': { name: 'Wall', color: COLORS.wall, char: '#' },
			'7': { name: 'Wall N', color: COLORS.wall, char: '7' },
			'8': { name: 'Wall S', color: COLORS.wall, char: '8' },
			'9': { name: 'Wall E', color: COLORS.wall, char: '9' },
			'0': { name: 'Wall W', color: COLORS.wall, char: '0' }
		},
		'Doors Closed': {
			'D': { name: 'Door Closed', color: COLORS.doorClosed, char: 'D' },
			'1': { name: 'Door Closed N', color: COLORS.doorClosed, char: '1' },
			'2': { name: 'Door Closed S', color: COLORS.doorClosed, char: '2' },
			'3': { name: 'Door Closed E', color: COLORS.doorClosed, char: '3' },
			'4': { name: 'Door Closed W', color: COLORS.doorClosed, char: '4' }
		},
		'Doors Open': {
			'd': { name: 'Door Open', color: COLORS.doorOpen, char: 'd' },
			'5': { name: 'Door Open N', color: COLORS.doorOpen, char: '5' },
			'6': { name: 'Door Open S', color: COLORS.doorOpen, char: '6' },
			'!': { name: 'Door Open E', color: COLORS.doorOpen, char: '!' },
			'@': { name: 'Door Open W', color: COLORS.doorOpen, char: '@' }
		},
		'Switches': {
			'S': { name: 'Switch', color: COLORS.lever, char: 'S' },
			'T': { name: 'Switch N', color: COLORS.lever, char: 'T' },
			'U': { name: 'Switch S', color: COLORS.lever, char: 'U' },
			'V': { name: 'Switch E', color: COLORS.lever, char: 'V' },
			'W': { name: 'Switch W', color: COLORS.lever, char: 'W' }
		},
		'Interactive': {
			'B': { name: 'Bridge On', color: COLORS.bridge, char: 'B' },
			'b': { name: 'Bridge Off', color: COLORS.bridgeOff, char: 'b' }
		},
		'Items': {
			'K': { name: 'Key', color: COLORS.key, char: 'K' },
			'P': { name: 'Player Start', color: COLORS.player, char: 'P' }
		}
	};

	// Flatten for backward compatibility
	const TILES = {};
	Object.values(TILE_CATEGORIES).forEach(category => {
		Object.assign(TILES, category);
	});

	// Editor state
	let game, scene;
	let selectedTile = '.';
	let selectedId = '1'; // Default ID for levers/doors
	let grid = [];
	let props = { switches: [], doors: [], items: [] }; // Track props separately
	let tileSprites = {};
	let hoverSprite = null;
	let playerStartPos = null;
	let isoOrigin = { x: 0, y: 0 };
	let isPainting = false;
	let isErasing = false;
	let lastPaintedTile = null;
	let assetMap = null;

	// Initialize grid
	function initGrid() {
		grid = [];
		props = { switches: [], doors: [], items: [] };
		playerStartPos = null;
		for (let y = 0; y < GRID_H; y++) {
			grid[y] = [];
			for (let x = 0; x < GRID_W; x++) {
				grid[y][x] = '.'; // floor by default
			}
		}
	}

	// Helper function to get display character for multi-character tokens
	function getDisplayChar(token) {
		if (token.length === 1) return token;
		return token[0]; // Show base character for L1->L, D1->D, d2->d
	}

	// Helper function to get texture key for multi-character tokens
	function getTextureKeyForToken(token) {
		const char = getDisplayChar(token);
		return getTextureKeyForTile(char);
	}

	// Helper functions for props
	function addProp(gx, gy, type, id = null) {
		// Remove existing prop at this location first
		removePropAt(gx, gy);
		
		if (type === 'S' || type === 'T' || type === 'U' || type === 'V' || type === 'W') {
			// Switch types
			props.switches.push({ 
				gx, gy, id, 
				on: false, // Default to off
				dir: getSwitchDirection(type)
			});
		} else if (type === 'K') {
			props.items.push({ gx, gy, type: 'key' });
		} else {
			// Door types
			const isOpen = type === 'd' || type === '5' || type === '6' || type === '!' || type === '@';
			props.doors.push({ gx, gy, id, open: isOpen, dir: getDoorDirection(type) });
		}
	}

	function removePropAt(gx, gy) {
		props.switches = props.switches.filter(p => !(p.gx === gx && p.gy === gy));
		props.doors = props.doors.filter(p => !(p.gx === gx && p.gy === gy));
		props.items = props.items.filter(p => !(p.gx === gx && p.gy === gy));
	}

	function findPropAt(gx, gy) {
		const switchProp = props.switches.find(p => p.gx === gx && p.gy === gy);
		if (switchProp) return { type: 'switch', obj: switchProp };
		
		const door = props.doors.find(p => p.gx === gx && p.gy === gy);
		if (door) return { type: 'door', obj: door };
		
		const item = props.items.find(p => p.gx === gx && p.gy === gy);
		if (item) return { type: 'item', obj: item };
		
		return null;
	}

	function getSwitchDirection(char) {
		const dirMap = {
			'S': 'default',  // Default (will map to 'default' in texture)
			'T': 'n',       // North
			'U': 's',       // South  
			'V': 'e',       // East
			'W': 'w'        // West
		};
		return dirMap[char] || 'default';
	}

	function getDoorDirection(char) {
		const dirMap = {
			'D': 's', 'd': 's',  // Default south
			'1': 'n', '5': 'n',  // North
			'2': 's', '6': 's',  // South  
			'3': 'e', '!': 'e',  // East
			'4': 'w', '@': 'w'   // West
		};
		return dirMap[char] || 's';
	}

	// Convert grid coordinates to screen position (isometric) - identical to game
	function gridToScreen(gx, gy, origin) {
		const x = (gx - gy) * (TILE_W / 2) + origin.x;
		const y = (gx + gy) * (TILE_H / 2) + origin.y;
		return { x, y };
	}

	// Convert screen position to grid coordinates - identical to game
	function screenToGrid(x, y, origin) {
		// Adjust picking Y to account for bottom-aligned tiles (originY = 1.0)
		const pickOffsetY = 0; // TILE_H / 2

		x = x - TILE_W /2
		const dx = x - origin.x;
		const dy = (y + pickOffsetY) - origin.y;
		
		const fx = dx / (TILE_W / 2);
		const fy = dy / (TILE_H / 2);
		const rawGx = (fx + fy) / 2;
		const rawGy = (fy - fx) / 2;
		// Offset by half a tile to fix the one-grid southeast issue
		const gx = Math.round(rawGx - 0.5);
		const gy = Math.round(rawGy - 0.5);
		return { gx, gy };
	}

	// Create tile sprite using actual game textures
	function createTileSprite(scene, x, y, textureKey, depth = 0) {
		if (textureKey && scene.textures.exists(textureKey)) {
			// Use actual game sprite
			const sprite = scene.add.image(x, y, textureKey);
			applySpriteAdjustments(sprite, textureKey);
			sprite.setDepth(depth);
			return sprite;
		} else {
			// Fallback to colored diamond for missing textures
			const graphics = scene.add.graphics();
			graphics.fillStyle(0x2a2f4a); // Default floor color
			
			// Create diamond shape
			const diamond = new Phaser.Geom.Polygon([
				TILE_W / 2, 0,      // top
				TILE_W, TILE_H / 2, // right
				TILE_W / 2, TILE_H, // bottom
				0, TILE_H / 2       // left
			]);
			
			graphics.fillPoints(diamond.points, true);
			graphics.setPosition(x, y);
			graphics.setDepth(depth);
			return graphics;
		}
	}

	// Update isometric origin to match game.js exactly
	function updateIsoOrigin() {
		isoOrigin.x = scene.cameras.main.width / 2;
       	isoOrigin.y = scene.cameras.main.height / 2 - (GRID_H * TILE_H / 4);
	}

	// Render the entire grid with actual game sprites
	function renderGrid() {
		// Clear existing sprites
		Object.values(tileSprites).forEach(sprite => sprite.destroy());
		tileSprites = {};

		updateIsoOrigin();

		// Render floor layer first (like the game)
		for (let y = 0; y < GRID_H; y++) {
			for (let x = 0; x < GRID_W; x++) {
				const char = grid[y][x];
				const pos = gridToScreen(x, y, isoOrigin);
				
				// Always render floor if not void
				if (char !== ' ') {
					const floorKey = getTextureKeyForTile('.');
					if (floorKey) {
						const floorSprite = createTileSprite(scene, pos.x, pos.y, floorKey, pos.y + DEPTHS.floor);
						tileSprites[`${x},${y}_floor`] = floorSprite;
					}
				}
			}
		}

		// Render walls/bridges/regular tiles (not props)
		for (let y = 0; y < GRID_H; y++) {
			for (let x = 0; x < GRID_W; x++) {
				const token = grid[y][x];
				const char = getDisplayChar(token);
				const pos = gridToScreen(x, y, isoOrigin);
				
				if (token !== ' ' && token !== '.') {
					const textureKey = getTextureKeyForToken(token);
					let depth = DEPTHS.floor;
					
					// Determine depth like the game (using display character)
					if (char === '#' || char === '7' || char === '8' || char === '9' || char === '0') {
						depth = DEPTHS.wall;
					} else if (char === 'B' || char === 'b') {
						depth = DEPTHS.floor;
					}
					
					if (textureKey) {
						const sprite = createTileSprite(scene, pos.x, pos.y, textureKey, pos.y + depth);
						tileSprites[`${x},${y}`] = sprite;
					}
					
					// Add character text for debugging non-prop tiles
					if (token !== '.' && token !== ' ') {
						const text = scene.add.text(pos.x + 20, pos.y - 20, token, {
							fontSize: '10px',
							fill: '#ffffff',
							stroke: '#000000',
							strokeThickness: 1
						});
						text.setOrigin(0.5, 0.5);
						text.setDepth(pos.y + depth + 100);
						text.setAlpha(0.5);
						tileSprites[`${x},${y}_text`] = text;
					}
				}
			}
		}

		// Render props (levers, doors, items) on top
		renderProps();
		
		// Render player start
		if (playerStartPos) {
			const pos = gridToScreen(playerStartPos.x, playerStartPos.y, isoOrigin);
			const playerKey = getTextureKeyForTile('P');
			if (playerKey) {
				const sprite = createTileSprite(scene, pos.x, pos.y, playerKey, pos.y + DEPTHS.player);
				applyPlayerSpriteAdjustments(sprite);
				tileSprites[`player`] = sprite;
			}
			
			// Add player marker text
			const text = scene.add.text(pos.x + 20, pos.y - 20, 'P', {
				fontSize: '12px',
				fill: '#8bbcff',
				stroke: '#000000',
				strokeThickness: 2
			});
			text.setOrigin(0.5, 0.5);
			text.setDepth(pos.y + DEPTHS.player + 100);
			tileSprites[`player_text`] = text;
		}
	}

	// Render all props (switches, doors, items) on top of tiles
	function renderProps() {
		// Render switches
		props.switches.forEach(switchProp => {
			const pos = gridToScreen(switchProp.gx, switchProp.gy, isoOrigin);
			
			// Get the correct switch texture based on direction and on/off state
			const switchKey = getSwitchTextureKey(switchProp.dir, switchProp.on);
			if (switchKey) {
				const sprite = createTileSprite(scene, pos.x, pos.y, switchKey, pos.y + DEPTHS.lever);
				// Apply switch-specific adjustments from JSON config
				applySwitchSpriteAdjustments(sprite);
				tileSprites[`switch_${switchProp.gx}_${switchProp.gy}`] = sprite;
			}
			
			// Add ID text and on/off state
			if (switchProp.id) {
				const stateColor = switchProp.on ? '#00ff00' : '#e3b341'; // Green if on, gold if off
				const text = scene.add.text(pos.x + 8, pos.y - 25, switchProp.id, {
					fontSize: '12px',
					fill: stateColor,
					stroke: '#000000',
					strokeThickness: 2
				});
				text.setOrigin(0.5, 0.5);
				text.setDepth(pos.y + DEPTHS.lever + 1);
				tileSprites[`switch_${switchProp.gx}_${switchProp.gy}_text`] = text;
			}
		});

		// Render doors
		props.doors.forEach(door => {
			const pos = gridToScreen(door.gx, door.gy, isoOrigin);
			
			// Get the correct door character based on direction and open/closed state
			let doorChar;
			if (door.open) {
				// Open doors: d, 5(N), 6(S), !(E), @(W)
				switch(door.dir) {
					case 'n': doorChar = '5'; break;
					case 's': doorChar = '6'; break;
					case 'e': doorChar = '!'; break;
					case 'w': doorChar = '@'; break;
					default: doorChar = 'd'; break;
				}
			} else {
				// Closed doors: D, 1(N), 2(S), 3(E), 4(W)  
				switch(door.dir) {
					case 'n': doorChar = '1'; break;
					case 's': doorChar = '2'; break;
					case 'e': doorChar = '3'; break;
					case 'w': doorChar = '4'; break;
					default: doorChar = 'D'; break;
				}
			}
			
			const doorKey = getTextureKeyForTile(doorChar);
			if (doorKey) {
				const sprite = createTileSprite(scene, pos.x, pos.y, doorKey, pos.y + DEPTHS.wall);
				// Don't override the origin - let createTileSprite and applySpriteAdjustments handle it
				tileSprites[`door_${door.gx}_${door.gy}`] = sprite;
			}
			
			// Add ID text if door has one
			if (door.id) {
				const textColor = door.open ? '#2f6b3f' : '#6b3f3f';
				const text = scene.add.text(pos.x + 8, pos.y - 25, door.id, {
					fontSize: '12px',
					fill: textColor,
					stroke: '#000000',
					strokeThickness: 2
				});
				text.setOrigin(0.5, 0.5);
				text.setDepth(pos.y + DEPTHS.wall + 1);
				tileSprites[`door_${door.gx}_${door.gy}_text`] = text;
			}
		});

		// Render items (keys)
		props.items.forEach(item => {
			const pos = gridToScreen(item.gx, item.gy, isoOrigin);
			const itemKey = getTextureKeyForTile('K');
			if (itemKey) {
				const sprite = createTileSprite(scene, pos.x, pos.y - 5, itemKey, pos.y + DEPTHS.item);
				sprite.setOrigin(0.5, 1.0);
				tileSprites[`item_${item.gx}_${item.gy}`] = sprite;
			}
			
			// Add item marker
			const text = scene.add.text(pos.x + 8, pos.y - 15, 'K', {
				fontSize: '10px',
				fill: '#f3e26c',
				stroke: '#000000',
				strokeThickness: 1
			});
			text.setOrigin(0.5, 0.5);
			text.setDepth(pos.y + DEPTHS.item + 1);
			tileSprites[`item_${item.gx}_${item.gy}_text`] = text;
		});
	}

	// Toggle switch on/off state
	function toggleSwitch(gx, gy) {
		const switchProp = props.switches.find(s => s.gx === gx && s.gy === gy);
		if (switchProp) {
			switchProp.on = !switchProp.on;
			console.log(`Switch at ${gx},${gy} toggled to ${switchProp.on ? 'ON' : 'OFF'}`);
			return true;
		}
		return false;
	}

	// Paint tile at grid position
	function paintTile(gx, gy, erase = false) {
		if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return false;
		
		// Don't paint same tile repeatedly
		const tileKey = `${gx},${gy}`;
		if (lastPaintedTile === tileKey) return false;
		lastPaintedTile = tileKey;
		
		if (erase) {
			// Check if there's a switch to toggle instead of erasing
			if (toggleSwitch(gx, gy)) {
				// Switch was toggled, don't erase
				return true;
			}
			
			// Erasing - remove props and player, set tile to floor
			removePropAt(gx, gy);
			if (playerStartPos && playerStartPos.x === gx && playerStartPos.y === gy) {
				playerStartPos = null;
			}
			grid[gy][gx] = '.'; // Floor instead of void
		} else {
			// Placing
			const isSwitch = selectedTile === 'S' || selectedTile === 'T' || selectedTile === 'U' || selectedTile === 'V' || selectedTile === 'W';
			const isDoor = selectedTile === 'D' || selectedTile === 'd' || selectedTile === '1' || selectedTile === '2' || 
			              selectedTile === '3' || selectedTile === '4' || selectedTile === '5' || selectedTile === '6' || 
			              selectedTile === '!' || selectedTile === '@';
			
			if (isSwitch || selectedTile === 'K' || isDoor) {
				// These are props - don't replace the tile, add as props
				addProp(gx, gy, selectedTile, selectedId);
			} else if (selectedTile === 'P') {
				// Player start - remove old one and set new
				if (playerStartPos) {
					// Don't need to change old tile since player was never a tile replacement
				}
				playerStartPos = { x: gx, y: gy };
			} else {
				// Regular tiles - walls, floors, bridges, etc.
				grid[gy][gx] = selectedTile;
			}
		}
		
		return true;
	}

	// Handle grid clicks and painting
	function handleGridInteraction(pointer, isRightClick = false) {
		const gridPos = screenToGrid(pointer.x, pointer.y, isoOrigin);
		
		if (paintTile(gridPos.gx, gridPos.gy, isRightClick)) {
			renderGrid();
			updateStatus();
		}
	}

	// Phaser scene functions
	function preload() {
		scene = this;
		
		// Load asset mapping and handle missing files gracefully
		this.load.on('loaderror', () => {/* ignore to allow fallbacks */});
		this.load.json('asset_map', 'assets/mapping.json');
		
		// Wait for JSON to load, then load all textures
		this.load.once('complete', () => {
			const mapping = this.cache.json.get('asset_map');
			if (mapping) {
				loadGameAssets.call(this, mapping);
			}
		});
	}

	// Load game assets based on mapping - similar to game.js
	function loadGameAssets(mapping) {
		assetMap = mapping;
		
		// Load floor textures
		if (mapping.floor) {
			Object.entries(mapping.floor).forEach(([key, path]) => {
				this.load.image(`floor_${key}`, path);
			});
		}
		
		// Load wall textures
		if (mapping.wall) {
			Object.entries(mapping.wall).forEach(([key, path]) => {
				this.load.image(`wall_${key}`, path);
			});
		}
		
		// Load door textures
		if (mapping.door_closed) {
			Object.entries(mapping.door_closed).forEach(([key, path]) => {
				this.load.image(`door_closed_${key}`, path);
			});
		}
		
		if (mapping.door_open) {
			Object.entries(mapping.door_open).forEach(([key, path]) => {
				this.load.image(`door_open_${key}`, path);
			});
		}
		
		if (mapping.doorway) {
			Object.entries(mapping.doorway).forEach(([key, path]) => {
				this.load.image(`doorway_${key}`, path);
			});
		}
		
		// Load switch textures
		if (mapping.switch_off) {
			Object.entries(mapping.switch_off).forEach(([key, path]) => {
				this.load.image(`switch_off_${key}`, path);
			});
		}
		
		if (mapping.switch_on) {
			Object.entries(mapping.switch_on).forEach(([key, path]) => {
				this.load.image(`switch_on_${key}`, path);
			});
		}
		
		// Load other assets
		if (mapping.tile_bridge_on_img) this.load.image('bridge_on', mapping.tile_bridge_on_img);
		if (mapping.tile_bridge_off_img) this.load.image('bridge_off', mapping.tile_bridge_off_img);
		if (mapping.item_key_img) this.load.image('key', mapping.item_key_img);
		if (mapping.lever_img) this.load.image('lever', mapping.lever_img);
		
		// Load fallback tiles (like game.js does)
		this.load.image('tile_floor_img', 'assets/floor.png');
		this.load.image('tile_floor', 'assets/floor.png');
		
		// Load player sprite if available
		if (mapping.player_sheet && mapping.player_sheet.idle && mapping.player_sheet.idle.south) {
			this.load.image('player', mapping.player_sheet.idle.south.replace('.png', '0.png'));
		}
		
		// Start loading
		this.load.start();
	}

	// Get texture key for switches based on direction and on/off state
	function getSwitchTextureKey(dir, isOn) {
		const state = isOn ? 'on' : 'off';
		const dirKey = dir; // Use direction as-is now
		
		const textureKey = `switch_${state}_${dirKey}`;
		if (scene.textures.exists(textureKey)) {
			return textureKey;
		}
		
		// Fallback to default direction
		const fallbackKey = `switch_${state}_default`;
		if (scene.textures.exists(fallbackKey)) {
			return fallbackKey;
		}
		
		// Final fallback to lever
		return scene.textures.exists('lever') ? 'lever' : null;
	}

	// Get texture key for a tile character - similar to game.js logic
	function getTextureKeyForTile(char) {
		switch (char) {
			case '.':
				return scene.textures.exists('floor_default') ? 'floor_default' : 
				       scene.textures.exists('floor_e') ? 'floor_e' :
				       scene.textures.exists('tile_floor_img') ? 'tile_floor_img' : null;
			case '#':
			case '7': // Wall North
				return scene.textures.exists('wall_n') ? 'wall_n' : null;
			case '8': // Wall South
				return scene.textures.exists('wall_s') ? 'wall_s' : null;
			case '9': // Wall East
				return scene.textures.exists('wall_e') ? 'wall_e' : null;
			case '0': // Wall West
				return scene.textures.exists('wall_w') ? 'wall_w' : null;
			case 'D': // Door Closed (default south)
				return scene.textures.exists('door_closed_s') ? 'door_closed_s' : null;
			case '1': // Door Closed North
				return scene.textures.exists('door_closed_n') ? 'door_closed_n' : null;
			case '2': // Door Closed South
				return scene.textures.exists('door_closed_s') ? 'door_closed_s' : null;
			case '3': // Door Closed East
				return scene.textures.exists('door_closed_e') ? 'door_closed_e' : null;
			case '4': // Door Closed West
				return scene.textures.exists('door_closed_w') ? 'door_closed_w' : null;
			case 'd': // Door Open (default south)
				return scene.textures.exists('door_open_s') ? 'door_open_s' : null;
			case '5': // Door Open North
				return scene.textures.exists('door_open_n') ? 'door_open_n' : null;
			case '6': // Door Open South
				return scene.textures.exists('door_open_s') ? 'door_open_s' : null;
			case '!': // Door Open East
				return scene.textures.exists('door_open_e') ? 'door_open_e' : null;
			case '@': // Door Open West
				return scene.textures.exists('door_open_w') ? 'door_open_w' : null;
			case 'B': // Bridge On
				return scene.textures.exists('bridge_on') ? 'bridge_on' : null;
			case 'b': // Bridge Off
				return scene.textures.exists('bridge_off') ? 'bridge_off' : null;
			case 'L': // Lever
				return scene.textures.exists('lever') ? 'lever' : null;
			case 'K': // Key
				return scene.textures.exists('key') ? 'key' : null;
			case 'P': // Player
				return scene.textures.exists('player') ? 'player' : null;
			default:
				return null;
		}
	}

	// Apply sprite adjustments - identical to game.js applyTileSpriteAdjustments
	function applySpriteAdjustments(sp, key) {
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
		const amap = scene.assetMap || {};
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
		sp.setOrigin(0, originY - 0.26);
		sp.y += offsetY;
	}

	// Apply player sprite adjustments - identical to game.js applyPlayerSpriteAdjustments
	function applyPlayerSpriteAdjustments(sprite) {
		if (!sprite) return;
		
		const amap = scene.assetMap || {};
		const targetWidth = (typeof amap.player_targetWidth === 'number' ? amap.player_targetWidth : Math.round(TILE_W * 0.9));
		const originY = (typeof amap.player_originY === 'number' ? amap.player_originY : 1.0);
		const offsetY = (typeof amap.player_offsetY === 'number' ? amap.player_offsetY : -4);
		
		const texImg = sprite.texture && sprite.texture.getSourceImage ? sprite.texture.getSourceImage() : null;
		if (texImg && texImg.width) {
			const scale = targetWidth / texImg.width;
			sprite.setScale(scale);
		} else {
			sprite.displayWidth = targetWidth;
			sprite.scaleY = sprite.scaleX;
		}
		
		// sprite.setOrigin(0.5, originY);
		// sprite.setOrigin(0, originY - 0.26);
		// sprite.y += offsetY;
	}

	// Apply switch sprite adjustments using JSON config
	function applySwitchSpriteAdjustments(sprite) {
		if (!sprite) return;
		
		const amap = scene.assetMap || {};
		const originY = (typeof amap.switch_originY === 'number' ? amap.switch_originY : 1.0);
		const offsetY = (typeof amap.switch_offsetY === 'number' ? amap.switch_offsetY : -10);
		
		// Scale by width to preserve aspect ratio
		const tex = sprite.texture && sprite.texture.getSourceImage ? sprite.texture.getSourceImage() : null;
		if (tex && tex.width) {
			const scale = TILE_W / tex.width;
			sprite.setScale(scale);
		} else {
			sprite.displayWidth = TILE_W;
			sprite.scaleY = sprite.scaleX;
		}
		
		sprite.setOrigin(0.5, originY);
		sprite.y += offsetY;
	}

	function create() {
		scene = this;
		
		// Store asset map on scene like the game does - exact same as game.js
		scene.assetMap = scene.cache.json.get('asset_map') || {};
		console.log('Loaded asset map:', scene.assetMap);
		
		// Initialize grid
		initGrid();
		
		// Enable pointer events for painting
		this.input.on('pointerdown', (pointer) => {
			if (pointer.rightButtonDown()) {
				isErasing = true;
				isPainting = true;
			} else {
				isErasing = false;
				isPainting = true;
			}
			lastPaintedTile = null; // Reset for new paint stroke
			handleGridInteraction(pointer, isErasing);
		});
		
		this.input.on('pointerup', (pointer) => {
			isPainting = false;
			isErasing = false;
			lastPaintedTile = null;
		});
		
		this.input.on('pointermove', (pointer) => {
			if (isPainting) {
				handleGridInteraction(pointer, isErasing);
			}
		});
		
		// Render initial grid
		renderGrid();
		
		// Initialize UI
		initializePalette();
		updateStatus();
		
		// Setup ID input handler
		const idInput = document.getElementById('idInput');
		if (idInput) {
			idInput.addEventListener('input', (e) => {
				let value = e.target.value;
				// Only allow alphanumeric characters
				value = value.replace(/[^a-zA-Z0-9]/g, '');
				if (value.length === 0) value = '1'; // Default to 1
				e.target.value = value;
				selectedId = value;
				updateStatus();
			});
		}
		
		// Scan for available levels
		scanAvailableLevelsEditor();
	}

	function update() {
		// Handle hover effect
		const pointer = scene.input.activePointer;
		if (pointer.isDown) return;
		
		const gridPos = screenToGrid(pointer.x, pointer.y, isoOrigin);
		
		if (gridPos.gx >= 0 && gridPos.gx < GRID_W && gridPos.gy >= 0 && gridPos.gy < GRID_H) {
			if (!hoverSprite) {
				const pos = gridToScreen(gridPos.gx, gridPos.gy, isoOrigin);
				// Create hover sprite as colored diamond (no texture needed)
				hoverSprite = scene.add.graphics();
				hoverSprite.fillStyle(0x8fd2ff);
				const diamond = new Phaser.Geom.Polygon([
					TILE_W / 2, 0, TILE_W, TILE_H / 2, TILE_W / 2, TILE_H, 0, TILE_H / 2
				]);
				hoverSprite.fillPoints(diamond.points, true);
				hoverSprite.setPosition(pos.x, pos.y);
				hoverSprite.setDepth(pos.y + DEPTHS.hover);
				hoverSprite.setAlpha(0.5);
			} else {
				const pos = gridToScreen(gridPos.gx, gridPos.gy, isoOrigin);
				hoverSprite.setPosition(pos.x, pos.y);
				hoverSprite.setDepth(pos.y + DEPTHS.hover);
			}
		} else {
			if (hoverSprite) {
				hoverSprite.destroy();
				hoverSprite = null;
			}
		}
	}

	// Initialize Phaser game
	const config = {
		type: Phaser.AUTO,
		parent: 'game-root',
		backgroundColor: '#0f1220',
		scale: {
			mode: Phaser.Scale.RESIZE,
			width: window.innerWidth - 300, // Account for sidebar
			height: window.innerHeight
		},
		scene: { preload, create, update }
	};

	// UI Functions
	function initializePalette() {
		const palette = document.getElementById('tilePalette');
		palette.innerHTML = '';
		
		Object.entries(TILE_CATEGORIES).forEach(([categoryName, categoryTiles]) => {
			// Create category header
			const categoryHeader = document.createElement('div');
			categoryHeader.className = 'category-header';
			categoryHeader.innerHTML = categoryName;
			palette.appendChild(categoryHeader);
			
			// Create category container
			const categoryContainer = document.createElement('div');
			categoryContainer.className = 'category-tiles';
			
			Object.entries(categoryTiles).forEach(([char, tile]) => {
				const option = document.createElement('div');
				option.className = 'tile-option';
				option.innerHTML = `
					<div class="tile-char" style="color: #${tile.color.toString(16).padStart(6, '0')}">${char === ' ' ? '∅' : char}</div>
					<div>${tile.name}</div>
				`;
				option.onclick = () => selectTile(char);
				
				if (char === selectedTile) {
					option.classList.add('selected');
				}
				
				categoryContainer.appendChild(option);
			});
			
			palette.appendChild(categoryContainer);
		});
	}

	function selectTile(char) {
		selectedTile = char;
		
		// Update palette selection
		document.querySelectorAll('.tile-option').forEach(option => {
			option.classList.remove('selected');
		});
		
		event.currentTarget.classList.add('selected');
		
		// Show/hide ID selector for switches and doors
		const idSelector = document.getElementById('idSelector');
		const isSwitch = char === 'S' || char === 'T' || char === 'U' || char === 'V' || char === 'W';
		const isDoor = char === 'D' || char === 'd' || char === '1' || char === '2' || 
		              char === '3' || char === '4' || char === '5' || char === '6' || 
		              char === '!' || char === '@';
		if (isSwitch || isDoor) {
			idSelector.style.display = 'block';
		} else {
			idSelector.style.display = 'none';
		}
		
		updateStatus();
	}

	function updateStatus() {
		const status = document.getElementById('status');
		const tileName = TILES[selectedTile].name;
		let statusText = `Selected: ${tileName}`;
		
		// Show ID for switches/doors
		const isSwitch = selectedTile === 'S' || selectedTile === 'T' || selectedTile === 'U' || selectedTile === 'V' || selectedTile === 'W';
		const isDoor = selectedTile === 'D' || selectedTile === 'd' || selectedTile === '1' || selectedTile === '2' || 
		              selectedTile === '3' || selectedTile === '4' || selectedTile === '5' || selectedTile === '6' || 
		              selectedTile === '!' || selectedTile === '@';
		if (isSwitch || isDoor) {
			statusText += ` (ID: ${selectedId})`;
		}
		
		statusText += ` | Grid: ${GRID_W}×${GRID_H} | ${playerStartPos ? 'Player set' : 'No player start'}`;
		status.textContent = statusText;
	}

	// Global functions for UI
	window.resizeGrid = function() {
		const newW = parseInt(document.getElementById('gridWidth').value);
		const newH = parseInt(document.getElementById('gridHeight').value);
		
		if (newW < 5 || newW > 20 || newH < 5 || newH > 20) {
			alert('Grid size must be between 5 and 20');
			return;
		}
		
		// Create new grid and copy existing data
		const oldGrid = grid;
		GRID_W = newW;
		GRID_H = newH;
		
		initGrid();
		
		// Copy existing tiles that fit in new size
		for (let y = 0; y < Math.min(oldGrid.length, GRID_H); y++) {
			for (let x = 0; x < Math.min(oldGrid[y].length, GRID_W); x++) {
				grid[y][x] = oldGrid[y][x];
			}
		}
		
		// Check if player start is still valid
		if (playerStartPos && (playerStartPos.x >= GRID_W || playerStartPos.y >= GRID_H)) {
			playerStartPos = null;
		}
		
		renderGrid();
		updateStatus();
	};

	window.clearGrid = function() {
		if (confirm('Clear the entire grid?')) {
			initGrid();
			playerStartPos = null;
			renderGrid();
			updateStatus();
			document.getElementById('exportArea').value = '';
		}
	};

	// Save level to assets/levels/ folder
	window.saveLevel = function() {
		const levelName = document.getElementById('levelName').value.trim() || 'level1';
		const fileName = levelName.endsWith('.txt') ? levelName : levelName + '.txt';
		
		// Use the export function to generate level data with props
		exportLevel();
		const levelData = document.getElementById('exportArea').value;
		
		// Create download link for the level file
		const blob = new Blob([levelData], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		a.style.display = 'none';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		
		alert(`Level saved as ${fileName}\nMove this file to assets/levels/ folder to use in game.`);
	};

	// Load level from assets/levels/ folder
	window.loadLevelFromAssets = function() {
		const levelName = document.getElementById('levelName').value.trim() || 'level1';
		const fileName = levelName.endsWith('.txt') ? levelName : levelName + '.txt';
		const levelPath = `assets/levels/${fileName}`;
		
		console.log(`Attempting to load: ${levelPath}`);
		
		fetch(levelPath, {
			method: 'GET',
			cache: 'no-cache',
			headers: {
				'Cache-Control': 'no-cache'
			}
		})
			.then(response => {
				console.log(`Response status: ${response.status}`);
				if (!response.ok) {
					throw new Error(`Level file not found: ${fileName} (Status: ${response.status})`);
				}
				return response.text();
			})
			.then(content => {
				console.log('Level content loaded, length:', content.length);
				loadLevelData(content);
				alert(`Level ${fileName} loaded successfully!`);
			})
			.catch(error => {
				alert(`Error loading level: ${error.message}\n\nTip: Make sure the Python server is running and the file exists in assets/levels/`);
				console.error('Load error:', error);
				
				// Suggest alternative
				console.log('Available files: level1.txt, level2.txt');
				console.log('Try using "Import from File" instead if fetch fails');
			});
	};

	// Parse multi-character tokens from level line (same as game.js)
	function parseLineTokens(line) {
		const tokens = [];
		let i = 0;
		while (i < line.length) {
			const char = line[i];
			if ((char === 'L' || char === 'D' || char === 'd') && i + 1 < line.length) {
				// Check if next character is a digit
				const nextChar = line[i + 1];
				if (/\d/.test(nextChar)) {
					// Multi-character token like L1, D2, d3
					tokens.push(char + nextChar);
					i += 2;
					continue;
				}
			}
			// Single character token
			tokens.push(char);
			i++;
		}
		return tokens;
	}

	// Helper function to load level data
	function loadLevelData(content) {
		const lines = content.split('\n').filter(line => line.trim() !== ''); // Remove empty lines
		
		// Parse tokens from each line to determine actual grid width
		const parsedLines = lines.map(line => parseLineTokens(line.trimEnd()));
		const fileH = parsedLines.length;
		const fileW = Math.max(...parsedLines.map(tokens => tokens.length));
		
		console.log(`Loading level: ${fileW}x${fileH}`);
		
		if (fileW > 20 || fileH > 20) {
			alert(`Level too large (${fileW}x${fileH}, max 20x20)`);
			return;
		}
		
		// Update grid size inputs
		document.getElementById('gridWidth').value = fileW;
		document.getElementById('gridHeight').value = fileH;
		
		GRID_W = fileW;
		GRID_H = fileH;
		
		initGrid();
		playerStartPos = null;
		
		// Load level data using parsed tokens
		for (let y = 0; y < parsedLines.length && y < GRID_H; y++) {
			const tokens = parsedLines[y];
			for (let x = 0; x < tokens.length && x < GRID_W; x++) {
				const token = tokens[x];
				const baseChar = getDisplayChar(token);
				
				// Handle props (S, T, U, V, W, K, D, d and variants)
				if (baseChar === 'S' || baseChar === 'T' || baseChar === 'U' || baseChar === 'V' || baseChar === 'W') {
					grid[y][x] = '.'; // Floor underneath
					const id = token.length > 1 ? token.substring(1) : null;
					addProp(x, y, baseChar, id);
				} else if (baseChar === 'L') {
					// Legacy lever support - convert to switch
					grid[y][x] = '.'; // Floor underneath
					const id = token.length > 1 ? token.substring(1) : null;
					addProp(x, y, 'S', id); // Convert to default switch
				} else if (baseChar === 'K') {
					grid[y][x] = '.'; // Floor underneath
					addProp(x, y, 'K');
				} else if (baseChar === 'D' || baseChar === 'd' || 
				          baseChar === '1' || baseChar === '2' || baseChar === '3' || baseChar === '4' ||
				          baseChar === '5' || baseChar === '6' || baseChar === '!' || baseChar === '@') {
					grid[y][x] = '.'; // Floor underneath
					const id = token.length > 1 ? token.substring(1) : null;
					addProp(x, y, baseChar, id);
				} else if (baseChar === 'P') {
					grid[y][x] = '.'; // Floor underneath
					playerStartPos = { x, y };
				} else if (TILES[baseChar]) {
					// Regular tile
					grid[y][x] = token;
				} else if (token === undefined || token === '') {
					grid[y][x] = '.'; // Default to floor for empty spaces
				} else {
					// Unknown token, default to floor
					grid[y][x] = '.';
				}
			}
		}
		
		renderGrid();
		updateStatus();
		exportLevel(); // Show loaded data in export area
	}

	window.exportLevel = function() {
		let levelData = '';
		
		for (let y = 0; y < GRID_H; y++) {
			for (let x = 0; x < GRID_W; x++) {
				let cell = grid[y][x];
				
				// Check for props at this position
				const prop = findPropAt(x, y);
				if (prop) {
					if (prop.type === 'switch') {
						// Export switch with direction character
						let switchChar;
						switch(prop.obj.dir) {
							case 'n': switchChar = 'T'; break;
							case 's': switchChar = 'U'; break;
							case 'e': switchChar = 'V'; break;
							case 'w': switchChar = 'W'; break;
							default: switchChar = 'S'; break;
						}
						cell = prop.obj.id ? `${switchChar}${prop.obj.id}` : switchChar;
					} else if (prop.type === 'door') {
						const doorChar = prop.obj.open ? 'd' : 'D';
						cell = prop.obj.id ? `${doorChar}${prop.obj.id}` : doorChar;
					} else if (prop.type === 'item' && prop.obj.type === 'key') {
						cell = 'K';
					}
				}
				
				// Check for player at this position
				if (playerStartPos && playerStartPos.x === x && playerStartPos.y === y) {
					cell = 'P';
				}
				
				levelData += cell;
			}
			if (y < GRID_H - 1) {
				levelData += '\n';
			}
		}
		
		document.getElementById('exportArea').value = levelData;
	};

	window.loadLevel = function(event) {
		const file = event.target.files[0];
		if (!file) return;
		
		const reader = new FileReader();
		reader.onload = function(e) {
			loadLevelData(e.target.result);
			alert(`Level ${file.name} imported successfully!`);
		};
		
		reader.readAsText(file);
	};

	// Scan assets/levels/ folder for available levels in editor
	function scanAvailableLevelsEditor() {
		const levelSelect = document.getElementById('levelSelectEditor');
		
		if (!levelSelect) return;
		
		// Try to scan for common level files
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
		});
		
		// Update level name input when selection changes
		levelSelect.addEventListener('change', (e) => {
			if (e.target.value) {
				const levelName = e.target.value.replace('.txt', '');
				document.getElementById('levelName').value = levelName;
			}
		});
	}
	
	// Load selected level from dropdown
	window.loadSelectedLevel = function() {
		const levelSelect = document.getElementById('levelSelectEditor');
		const selectedLevel = levelSelect.value;
		
		if (!selectedLevel) {
			alert('Please select a level from the dropdown first.');
			return;
		}
		
		const levelPath = `assets/levels/${selectedLevel}`;
		
		fetch(levelPath)
			.then(response => {
				if (!response.ok) {
					throw new Error(`Level file not found: ${selectedLevel}`);
				}
				return response.text();
			})
			.then(content => {
				loadLevelData(content);
				alert(`Level ${selectedLevel} loaded successfully!`);
				// Update level name input
				const levelName = selectedLevel.replace('.txt', '');
				document.getElementById('levelName').value = levelName;
			})
			.catch(error => {
				alert(`Error loading level: ${error.message}`);
				console.error('Load error:', error);
			});
	};

	// Initialize the game
	game = new Phaser.Game(config);

})();