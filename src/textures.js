import * as THREE from 'three';

export function createTextureAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; // 8x8 textures of 16x16
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Helper to draw a pixelated block texture
    function drawBlock(x, y, palette, noise = 0.2) {
        const bx = x * 16;
        const by = y * 16;
        
        for (let py = 0; py < 16; py++) {
            for (let px = 0; px < 16; px++) {
                const baseColor = palette[Math.floor(Math.random() * palette.length)];
                ctx.fillStyle = baseColor;
                ctx.fillRect(bx + px, by + py, 1, 1);
            }
        }
        
        // Add subtle border/shading
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(bx, by + 15, 16, 1);
        ctx.fillRect(bx + 15, by, 1, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(bx, by, 16, 1);
        ctx.fillRect(bx, by, 1, 16);
    }

    // Palettes
    const palettes = {
        grass_top: ['#4ade80', '#22c55e', '#16a34a', '#15803d'],
        grass_side: ['#78350f', '#92400e', '#4ade80', '#22c55e'], // mixed for side
        dirt: ['#78350f', '#92400e', '#a16207', '#451a03'],
        stone: ['#64748b', '#475569', '#334155', '#94a3b8'],
        cobblestone: ['#475569', '#334155', '#1e293b', '#64748b'],
        wood_side: ['#451a03', '#713f12', '#92400e', '#451a03'],
        wood_top: ['#92400e', '#a16207', '#713f12', '#d97706'],
        leaves: ['#14532d', '#166534', '#15803d', '#16a34a'],
        glass: ['#bae6fd', '#7dd3fc', '#ffffff', '#e0f2fe'],
        bricks: ['#991b1b', '#b91c1c', '#7f1d1d', '#991b1b'],
        sand: ['#fde047', '#facc15', '#eab308', '#fef08a']
    };

    // Draw all textures
    drawBlock(0, 0, palettes.grass_top); // 0: Grass Top
    drawBlock(1, 0, palettes.grass_side); // 1: Grass Side
    drawBlock(2, 0, palettes.dirt);     // 2: Dirt
    drawBlock(3, 0, palettes.stone);    // 3: Stone
    drawBlock(4, 0, palettes.cobblestone); // 4: Cobble
    drawBlock(5, 0, palettes.wood_side);  // 5: Wood Side
    drawBlock(6, 0, palettes.wood_top);   // 6: Wood Top
    drawBlock(7, 0, palettes.leaves);    // 7: Leaves
    drawBlock(0, 1, palettes.glass);     // 8: Glass
    drawBlock(1, 1, palettes.bricks);    // 9: Bricks
    drawBlock(2, 1, palettes.sand);      // 10: Sand

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    
    return texture;
}
