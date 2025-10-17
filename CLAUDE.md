# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an isometric point-and-click puzzle game prototype built with Phaser 3. The game features:
- Isometric grid-based movement and pathfinding
- Interactive elements (doors, levers, keys, bridges)
- Level-based progression with text-based level definitions
- Real-time inventory and zoom controls

## Development Commands

**Start development server:**
```bash
python server.py
```
This starts a local HTTP server on port 8000 with no-cache headers to prevent browser caching during development. Access the game at `http://localhost:8000`.

**No build process required** - This is a vanilla JavaScript project that runs directly in the browser.

## Architecture

### Core Files
- `index.html` - Main HTML page with embedded CSS and Phaser 3 CDN
- `js/game.js` - Complete game logic (53k+ lines, contains all game systems)
- `server.py` - Development server with cache-busting headers
- `assets/mapping.json` - Asset mapping and game configuration

### Game Systems (all in game.js)
- **Grid System**: 11x11 isometric grid with diamond tiles (64x32px)
- **Pathfinding**: A* algorithm with dynamic obstacle avoidance
- **Level Loading**: Text-based levels from `assets/levels/` directory
- **Asset Management**: Dynamic sprite loading based on `mapping.json`
- **Game State**: Manages inventory, switches, doors, bridges
- **Input Handling**: Mouse/touch controls with hover feedback

### Asset Structure
```
assets/
├── kenney/           # Kenney.nl sprite assets (CC0/public domain)
│   ├── Isometric/    # Tiles, walls, doors, floors
│   ├── Characters/   # Player animations
│   ├── Items/        # Keys and collectibles
│   └── Props/        # Levers and interactive objects
├── levels/           # Text-based level definitions
│   ├── level1.txt
│   └── level2.txt
└── mapping.json      # Asset paths and game configuration
```

### Level Format
Levels are defined in text files using single characters:
- `.` = floor
- `#` = wall (with directional variants 7,8,9,0 for N,S,E,W)
- `D`/`d` = doors (closed/open)
- `B`/`b` = bridges (on/off)
- `L` = lever
- `K` = key
- `P` = player start
- `space` = void

### Key Constants
- `TILE_W = 64, TILE_H = 32` - Diamond tile dimensions
- `GRID_W = 11, GRID_H = 11` - Game grid size
- Current level file controlled by `mapping.json` `level_file` property

### Game State
- Inventory system for keys
- Switch states affecting bridges/doors
- Player movement with pathfinding
- Interactive object states persist during level

## Development Notes

- Game uses Phaser 3.80.1 from CDN
- All game logic is in a single file (`game.js`) using IIFE pattern
- Assets are loaded dynamically based on `mapping.json` configuration
- Player animations support 4 directions with walk/idle states
- HUD overlay stays above Phaser canvas with CSS z-index management
- Level switching handled via `mapping.json` modification