import * as THREE from 'three';
import { BLOCK_TYPES, BLOCKS } from './blocks';
import { createNoise2D } from 'simplex-noise';
import { createTextureAtlas } from './textures';

const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 64;

export class World {
    constructor(scene) {
        this.scene = scene;
        this.chunks = new Map(); // "x,z" -> Chunk data
        this.noise2D = createNoise2D();
        this.texture = createTextureAtlas();
        this.material = this.createVoxelMaterial();
    }

    createVoxelMaterial() {
        return new THREE.MeshLambertMaterial({ 
            map: this.texture,
            transparent: true,
            alphaTest: 0.1
        });
    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }

    generateChunk(cx, cz) {
        const key = this.getChunkKey(cx, cz);
        if (this.chunks.has(key)) return;

        const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
        
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const worldX = cx * CHUNK_SIZE + x;
                const worldZ = cz * CHUNK_SIZE + z;
                
                // Flat world height
                const height = 30;

                for (let y = 0; y < WORLD_HEIGHT; y++) {
                    const index = (y * CHUNK_SIZE * CHUNK_SIZE) + (z * CHUNK_SIZE) + x;
                    
                    if (y === height) {
                        data[index] = BLOCK_TYPES.GRASS;
                    } else if (y < height && y > height - 4) {
                        data[index] = BLOCK_TYPES.DIRT;
                    } else if (y <= height - 4) {
                        data[index] = BLOCK_TYPES.STONE;
                    } else {
                        data[index] = BLOCK_TYPES.AIR;
                    }
                }
            }
        }

        this.chunks.set(key, { cx, cz, data, mesh: null });
        this.updateChunkMesh(cx, cz);
    }

    getBlock(x, y, z) {
        if (y < 0 || y >= WORLD_HEIGHT) return BLOCK_TYPES.AIR;
        
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        
        // Fast path for coordinate lookup
        const chunk = this.chunks.get(`${cx},${cz}`);
        if (!chunk) return BLOCK_TYPES.AIR;

        // Use bitwise for faster positive modulo if CHUNK_SIZE is power of 2 (it is 16)
        const lx = x & (CHUNK_SIZE - 1);
        const lz = z & (CHUNK_SIZE - 1);
        
        return chunk.data[(y * CHUNK_SIZE * CHUNK_SIZE) + (lz * CHUNK_SIZE) + lx];
    }

    setBlock(x, y, z, type) {
        if (y < 0 || y >= WORLD_HEIGHT) return;
        
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const key = this.getChunkKey(cx, cz);
        
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        
        const index = (y * CHUNK_SIZE * CHUNK_SIZE) + (lz * CHUNK_SIZE) + lx;
        chunk.data[index] = type;
        
        this.updateChunkMesh(cx, cz);
        
        // Update neighbors if block is on edge
        if (lx === 0) this.updateChunkMesh(cx - 1, cz);
        if (lx === CHUNK_SIZE - 1) this.updateChunkMesh(cx + 1, cz);
        if (lz === 0) this.updateChunkMesh(cx, cz - 1);
        if (lz === CHUNK_SIZE - 1) this.updateChunkMesh(cx, cz + 1);
    }

    updateChunkMesh(cx, cz) {
        const key = this.getChunkKey(cx, cz);
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        if (chunk.mesh) {
            this.scene.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
        }

        const geometry = this.generateChunkGeometry(chunk);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        
        this.scene.add(mesh);
        chunk.mesh = mesh;
    }

    generateChunkGeometry(chunk) {
        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        let indexOffset = 0;

        const positions = [
            [1, 0, 0], [-1, 0, 0], // right, left
            [0, 1, 0], [0, -1, 0], // top, bottom
            [0, 0, 1], [0, 0, -1]  // front, back
        ];

        for (let y = 0; y < WORLD_HEIGHT; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    const blockIndex = (y * CHUNK_SIZE * CHUNK_SIZE) + (z * CHUNK_SIZE) + x;
                    const blockType = chunk.data[blockIndex];

                    if (blockType === BLOCK_TYPES.AIR) continue;

                    const worldX = chunk.cx * CHUNK_SIZE + x;
                    const worldZ = chunk.cz * CHUNK_SIZE + z;

                    // Check neighbors for face culling
                    for (let f = 0; f < 6; f++) {
                        const nx = worldX + positions[f][0];
                        const ny = y + positions[f][1];
                        const nz = worldZ + positions[f][2];

                        if (this.getBlock(nx, ny, nz) === BLOCK_TYPES.AIR) {
                            // Add face
                            this.addFaceToGeometry(f, x, y, z, blockType, vertices, normals, uvs, indices, indexOffset);
                            indexOffset += 4;
                        }
                    }
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        
        return geometry;
    }

    addFaceToGeometry(faceIndex, x, y, z, blockType, vertices, normals, uvs, indices, indexOffset) {
        const block = BLOCKS[blockType];
        
        // Face to Texture mapping
        let textureIndex = 0;
        if (block.textures.all !== undefined) {
            textureIndex = block.textures.all;
        } else {
            if (faceIndex === 2) textureIndex = block.textures.top; // Top
            else if (faceIndex === 3) textureIndex = block.textures.bottom; // Bottom
            else textureIndex = block.textures.side; // Sides
        }

        const atlasSize = 8; // 8x8 tiles
        const tx = textureIndex % atlasSize;
        const ty = Math.floor(textureIndex / atlasSize);
        const tileSize = 1 / atlasSize;
        
        const uvMinX = tx * tileSize;
        const uvMaxX = (tx + 1) * tileSize;
        const uvMinY = 1 - (ty + 1) * tileSize; // Flip Y for Three.js
        const uvMaxY = 1 - ty * tileSize;

        const faceVertices = [
            // Right (x+)
            [ [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1] ],
            // Left (x-)
            [ [0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0] ],
            // Top (y+)
            [ [0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0] ],
            // Bottom (y-)
            [ [0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1] ],
            // Front (z+)
            [ [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1] ],
            // Back (z-)
            [ [1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0] ]
        ];

        const faceNormals = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];

        const faceUVs = [
            [uvMaxX, uvMinY], [uvMaxX, uvMaxY], [uvMinX, uvMaxY], [uvMinX, uvMinY]
        ];

        const fv = faceVertices[faceIndex];
        const fn = faceNormals[faceIndex];

        for (let i = 0; i < 4; i++) {
            vertices.push(fv[i][0] + x, fv[i][1] + y, fv[i][2] + z);
            normals.push(fn[0], fn[1], fn[2]);
        }
        
        // Standard UV mapping for 4 vertices
        uvs.push(uvMinX, uvMinY, uvMinX, uvMaxY, uvMaxX, uvMaxY, uvMaxX, uvMinY);

        indices.push(
            indexOffset, indexOffset + 1, indexOffset + 2,
            indexOffset, indexOffset + 2, indexOffset + 3
        );
    }
}
