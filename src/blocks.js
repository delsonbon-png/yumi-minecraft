export const BLOCK_TYPES = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    COBBLESTONE: 4,
    OAK_LOG: 5,
    OAK_LEAVES: 6,
    GLASS: 7,
    BRICKS: 8,
    SAND: 9
};

export const BLOCKS = {
    [BLOCK_TYPES.GRASS]: {
        name: 'Grass',
        color: '#4ade80',
        textures: {
            top: 0,
            side: 1,
            bottom: 2
        }
    },
    [BLOCK_TYPES.DIRT]: {
        name: 'Dirt',
        color: '#78350f',
        textures: {
            all: 2
        }
    },
    [BLOCK_TYPES.STONE]: {
        name: 'Stone',
        color: '#64748b',
        textures: {
            all: 3
        }
    },
    [BLOCK_TYPES.COBBLESTONE]: {
        name: 'Cobblestone',
        color: '#475569',
        textures: {
            all: 4
        }
    },
    [BLOCK_TYPES.OAK_LOG]: {
        name: 'Oak Log',
        color: '#451a03',
        textures: {
            top: 6,
            side: 5,
            bottom: 6
        }
    },
    [BLOCK_TYPES.OAK_LEAVES]: {
        name: 'Oak Leaves',
        color: '#15803d',
        textures: {
            all: 7
        },
        transparent: true
    },
    [BLOCK_TYPES.GLASS]: {
        name: 'Glass',
        color: '#bae6fd',
        textures: {
            all: 8
        },
        transparent: true
    },
    [BLOCK_TYPES.BRICKS]: {
        name: 'Bricks',
        color: '#991b1b',
        textures: {
            all: 9
        }
    },
    [BLOCK_TYPES.SAND]: {
        name: 'Sand',
        color: '#fde047',
        textures: {
            all: 10
        }
    }
};

// Texture Atlas configuration
// We'll use a single texture atlas containing all 16x16 block textures.
export const TEXTURE_ATLAS_SIZE = 128; // 8x8 blocks if each block is 16px
export const BLOCK_TEXTURE_SIZE = 16;
