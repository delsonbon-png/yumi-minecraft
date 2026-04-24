import * as THREE from 'three';
import { BLOCK_TYPES } from './blocks';

export class Player {
    constructor(camera, world, domElement) {
        this.camera = camera;
        this.world = world;
        this.domElement = domElement;
        
        this.position = new THREE.Vector3(8, 32, 8);
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Minecraft Constants
        this.sensitivity = 0.002;
        this.accel = 0.05;
        this.frictionGround = 0.6;
        this.frictionAir = 0.91;
        this.jumpForce = 0.42;
        this.gravity = 0.08;
        this.airResist = 0.98;
        
        this.height = 1.8;
        this.radius = 0.3;
        
        this.keys = {};
        this.isFlying = false;
        this.onGround = false;
        this.verticalVelocity = 0;
        this.lastSpacePress = 0;
        this.isLocked = false;
        this.selectedBlock = null;

        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 10;
        
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.mobileMove = { x: 0, y: 0 };
        this.mobileLook = { x: 0, y: 0 };
        
        this.breakTimer = null;
        this.isLongPress = false;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === this.domElement;
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isLocked) return;
            this.camera.rotation.y -= e.movementX * this.sensitivity;
            this.camera.rotation.x -= e.movementY * this.sensitivity;
            this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
        });

        document.addEventListener('mousedown', (e) => {
            if (!this.isLocked && !this.isMobile) {
                this.domElement.requestPointerLock();
                return;
            }
            if (this.isLocked) {
                if (e.button === 0) this.handleInteraction(true); // Left click = Break
                if (e.button === 2) this.handleInteraction(false); // Right click = Place
            }
        });

        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') {
                const now = performance.now();
                if (now - this.lastSpacePress < 250) {
                    this.isFlying = !this.isFlying;
                    this.verticalVelocity = 0;
                }
                this.lastSpacePress = now;
            }
        });

        document.addEventListener('keyup', (e) => this.keys[e.code] = false);
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Mobile Methods
    onMobileLook(data) {
        const factor = 0.005;
        this.camera.rotation.y -= data.vector.x * factor;
        this.camera.rotation.x -= data.vector.y * factor;
        this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
    }

    onMobileTap() {
        // Place Block
        this.handleInteraction(false);
    }

    onLongPressStart() {
        // Break Block
        this.handleInteraction(true);
        if (navigator.vibrate) navigator.vibrate(50);
        
        // Continuous break
        this.breakTimer = setInterval(() => {
            this.handleInteraction(true);
            if (navigator.vibrate) navigator.vibrate(30);
        }, 250);
    }

    onLongPressEnd() {
        clearInterval(this.breakTimer);
    }

    update() {
        if (!this.isLocked && !this.isMobile) return;

        let inputX = 0;
        let inputZ = 0;
        if (this.keys['KeyW']) inputZ -= 1;
        if (this.keys['KeyS']) inputZ += 1;
        if (this.keys['KeyA']) inputX -= 1;
        if (this.keys['KeyD']) inputX += 1;

        if (this.isMobile && (Math.abs(this.mobileMove.x) > 0.1 || Math.abs(this.mobileMove.y) > 0.1)) {
            inputX = this.mobileMove.x;
            inputZ = -this.mobileMove.y; // Correct D-Pad orientation
        }

        const rotation = new THREE.Euler(0, this.camera.rotation.y, 0, 'YXZ');
        const inputDir = new THREE.Vector3(inputX, 0, inputZ).normalize();
        inputDir.applyEuler(rotation);

        if (inputDir.lengthSq() > 0) {
            this.velocity.x += inputDir.x * this.accel;
            this.velocity.z += inputDir.z * this.accel;
        }

        const friction = this.onGround ? this.frictionGround : this.frictionAir;
        this.velocity.x *= friction;
        this.velocity.z *= friction;

        if (this.isFlying) {
            const flySpeed = 0.15;
            if (this.keys['Space']) this.verticalVelocity = flySpeed;
            else if (this.keys['ShiftLeft']) this.verticalVelocity = -flySpeed;
            else this.verticalVelocity *= 0.8;
        } else {
            if (this.onGround) {
                this.verticalVelocity = 0;
                if (this.keys['Space']) {
                    this.verticalVelocity = this.jumpForce;
                    this.onGround = false;
                }
            } else {
                this.verticalVelocity -= this.gravity;
                this.verticalVelocity *= this.airResist;
            }
        }

        // Horizontal Collision
        const nextX = this.position.x + this.velocity.x;
        if (!this.checkCollision(nextX, this.position.y, this.position.z)) {
            this.position.x = nextX;
        } else { this.velocity.x = 0; }
        
        const nextZ = this.position.z + this.velocity.z;
        if (!this.checkCollision(this.position.x, this.position.y, nextZ)) {
            this.position.z = nextZ;
        } else { this.velocity.z = 0; }

        // Vertical Collision
        this.onGround = false;
        let nextY = this.position.y + this.verticalVelocity;
        
        if (this.verticalVelocity <= 0) {
            if (this.checkCollision(this.position.x, nextY, this.position.z)) {
                const blockTop = Math.ceil(nextY - this.height);
                nextY = blockTop + this.height;
                this.verticalVelocity = 0;
                this.onGround = true;
            }
        } else {
            if (this.checkCollision(this.position.x, nextY, this.position.z)) {
                nextY = Math.floor(nextY) - 0.01;
                this.verticalVelocity = 0;
            }
        }
        
        this.position.y = nextY;
        this.camera.position.set(this.position.x, this.position.y, this.position.z);
    }

    checkCollision(x, y, z) {
        const yLevels = [0, -this.height * 0.5, -this.height + 0.01];
        const checkPoints = [[0, 0, 0], [this.radius, 0, 0], [-this.radius, 0, 0], [0, 0, this.radius], [0, 0, -this.radius]];
        for (const oy of yLevels) {
            for (const [ox, _, oz] of checkPoints) {
                const block = this.world.getBlock(Math.floor(x + ox), Math.floor(y + oy), Math.floor(z + oz));
                if (block !== BLOCK_TYPES.AIR) return true;
            }
        }
        return false;
    }

    handleInteraction(isBreak) {
        const intersect = this.getVoxelIntersection();
        if (intersect) {
            if (isBreak) {
                this.world.setBlock(intersect.voxelPosition.x, intersect.voxelPosition.y, intersect.voxelPosition.z, BLOCK_TYPES.AIR);
            } else {
                const pos = intersect.voxelPosition.clone().add(intersect.normal);
                const playerPos = new THREE.Vector3(Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z));
                // Don't place inside player
                if (!pos.equals(playerPos) && !pos.equals(new THREE.Vector3(playerPos.x, playerPos.y - 1, playerPos.z))) {
                    this.world.setBlock(pos.x, pos.y, pos.z, this.selectedBlock);
                }
            }
        }
    }

    getVoxelIntersection() {
        const start = this.camera.position.clone();
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        for (let t = 0; t < 6; t += 0.1) {
            const point = start.clone().add(direction.clone().multiplyScalar(t));
            const vx = Math.floor(point.x);
            const vy = Math.floor(point.y);
            const vz = Math.floor(point.z);
            const block = this.world.getBlock(vx, vy, vz);
            if (block !== BLOCK_TYPES.AIR) {
                const prev = start.clone().add(direction.clone().multiplyScalar(t - 0.1));
                return {
                    voxelPosition: new THREE.Vector3(vx, vy, vz),
                    normal: new THREE.Vector3(Math.floor(prev.x) - vx, Math.floor(prev.y) - vy, Math.floor(prev.z) - vz)
                };
            }
        }
        return null;
    }
}
