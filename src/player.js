import * as THREE from 'three';
import { BLOCK_TYPES } from './blocks';

export class Player {
    constructor(camera, world, domElement) {
        this.camera = camera;
        this.world = world;
        this.domElement = domElement;
        
        this.position = new THREE.Vector3(8, 32, 8);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.direction = new THREE.Vector3();
        
        // Minecraft Constants (per tick/frame)
        this.sensitivity = 0.002;
        this.accel = 0.05;
        this.frictionGround = 0.6;
        this.frictionAir = 0.91;
        this.jumpForce = 0.42;
        this.gravity = 0.08;
        this.airResist = 0.98;
        
        this.width = 0.6;
        this.height = 1.8;
        this.radius = this.width / 2;
        
        this.keys = {};
        
        // Physics & State
        this.isFlying = false;
        this.onGround = false;
        this.verticalVelocity = 0;
        
        this.lastSpacePress = 0;
        this.isLocked = false;
        this.selectedBlock = null; // Will be set by main.js

        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 10;
        
        // Mobile State
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.mobileMove = { x: 0, y: 0 };
        this.mobileLook = { x: 0, y: 0 };
        
        // Interaction Timing
        this.pressTimer = null;
        this.repeatTimer = null;
        this.longPressThreshold = 500; // ms
        this.repeatRate = 200; // ms
        this.isLongPress = false;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        const handleDown = (e) => {
            if (!this.isLocked && !this.isMobile) {
                if (e.type === 'mousedown') this.domElement.requestPointerLock();
                return;
            }

            // Prevent building if touch is on joystick or button
            if (e.target && (e.target.classList.contains('mobile-btn') || e.target.closest('[id^="joystick"]'))) {
                return;
            }

            this.isLongPress = false;
            this.pressTimer = setTimeout(() => {
                this.isLongPress = true;
                this.handleInteraction(true); // First Break
                if (navigator.vibrate) navigator.vibrate(50);
                
                // Start continuous breaking
                this.repeatTimer = setInterval(() => {
                    this.handleInteraction(true);
                    if (navigator.vibrate) navigator.vibrate(30);
                }, this.repeatRate);
            }, this.longPressThreshold);
        };

        const handleUp = (e) => {
            clearTimeout(this.pressTimer);
            clearInterval(this.repeatTimer);
            
            if (!this.isLongPress && (this.isLocked || this.isMobile)) {
                // Prevent placing if we were just looking/joystick-ing
                if (e.target && (e.target.classList.contains('mobile-btn') || e.target.closest('[id^="joystick"]'))) {
                    return;
                }
                this.handleInteraction(false); // Quick Click = Place
            }
        };

        this.domElement.addEventListener('mousedown', handleDown);
        this.domElement.addEventListener('mouseup', handleUp);
        
        if (this.isMobile) {
            this.domElement.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) handleDown(e);
            }, { passive: false });
            this.domElement.addEventListener('touchend', (e) => {
                handleUp(e);
            }, { passive: false });
        }

        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === this.domElement;
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isLocked) return;
            
            this.camera.rotation.y -= e.movementX * this.sensitivity;
            this.camera.rotation.x -= e.movementY * this.sensitivity;
            
            // Limit vertical rotation
            this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
        });

        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            // Block selection
            if (e.code.startsWith('Digit')) {
                const digit = parseInt(e.code.slice(5));
                if (digit >= 1 && digit <= 9) {
                    const blockList = [
                        BLOCK_TYPES.GRASS, BLOCK_TYPES.DIRT, BLOCK_TYPES.STONE,
                        BLOCK_TYPES.COBBLESTONE, BLOCK_TYPES.OAK_LOG, BLOCK_TYPES.OAK_LEAVES,
                        BLOCK_TYPES.GLASS, BLOCK_TYPES.BRICKS, BLOCK_TYPES.SAND
                    ];
                    this.selectedBlock = blockList[digit - 1];
                    this.updateUI();
                }
            }

            // Double tap space to toggle flight
            if (e.code === 'Space') {
                const now = performance.now();
                if (now - this.lastSpacePress < 250) {
                    this.isFlying = !this.isFlying;
                    this.verticalVelocity = 0; // Stop falling/flying instantly
                }
                this.lastSpacePress = now;
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    onMobileMove(data) {
        this.mobileMove.x = data.vector.x;
        this.mobileMove.y = -data.vector.y;
    }

    onMobileMoveEnd() {
        this.mobileMove.x = 0;
        this.mobileMove.y = 0;
    }

    onMobileLook(data) {
        // Reduced sensitivity for joysticks
        const sens = 1.5;
        this.camera.rotation.y -= data.vector.x * this.sensitivity * sens;
        this.camera.rotation.x -= -data.vector.y * this.sensitivity * sens;
        this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
    }

    onMobileLookEnd() {}

    update() {
        if (!this.isLocked && !this.isMobile) return;

        // 1. Horizontal Input
        let inputX = 0;
        let inputZ = 0;
        if (this.keys['KeyW']) inputZ -= 1;
        if (this.keys['KeyS']) inputZ += 1;
        if (this.keys['KeyA']) inputX -= 1;
        if (this.keys['KeyD']) inputX += 1;

        // Mobile Move Override
        if (this.isMobile && (Math.abs(this.mobileMove.x) > 0.1 || Math.abs(this.mobileMove.y) > 0.1)) {
            inputX = this.mobileMove.x;
            inputZ = this.mobileMove.y;
        }

        // Apply sprinting / sneaking
        let speedMult = 1.0;
        if (this.keys['ControlLeft']) speedMult = 1.3;
        if (this.keys['ShiftLeft'] && !this.isFlying) speedMult = 0.3;

        // 2. Horizontal Acceleration
        const rotation = new THREE.Euler(0, this.camera.rotation.y, 0, 'YXZ');
        const inputDir = new THREE.Vector3(inputX, 0, inputZ).normalize();
        inputDir.applyEuler(rotation);

        if (inputDir.lengthSq() > 0) {
            this.velocity.x += inputDir.x * this.accel * speedMult;
            this.velocity.z += inputDir.z * this.accel * speedMult;
        }

        // 3. Friction
        const friction = this.onGround ? this.frictionGround : this.frictionAir;
        this.velocity.x *= friction;
        this.velocity.z *= friction;

        // 4. Vertical Physics
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
                    this.keys['Space'] = false; // Prevent auto-jump
                }
            } else {
                // Gravity & Air Resistance only when NOT on ground
                this.verticalVelocity -= this.gravity;
                this.verticalVelocity *= this.airResist;
            }
        }

        // 5. Collision & Movement
        // Horizontal Collision
        const nextX = this.position.x + this.velocity.x;
        if (!this.checkCollision(nextX, this.position.y, this.position.z)) {
            this.position.x = nextX;
        } else {
            this.velocity.x = 0;
        }
        
        const nextZ = this.position.z + this.velocity.z;
        if (!this.checkCollision(this.position.x, this.position.y, nextZ)) {
            this.position.z = nextZ;
        } else {
            this.velocity.z = 0;
        }

        // Vertical Collision
        this.onGround = false;
        let nextY = this.position.y + this.verticalVelocity;
        
        if (this.verticalVelocity <= 0) { // Falling or standing
            // Check collision at candidates position (nextY is head position)
            if (this.checkCollision(this.position.x, nextY, this.position.z)) {
                // Snap to block top (resolve feet)
                const feetY = nextY - this.height;
                const blockTop = Math.ceil(feetY);
                nextY = blockTop + this.height;
                this.verticalVelocity = 0;
                this.onGround = true;
            }
        } else if (this.verticalVelocity > 0) { // Jumping
            // Check head
            if (this.checkCollision(this.position.x, nextY, this.position.z)) {
                nextY = Math.floor(nextY) - 0.01;
                this.verticalVelocity = 0;
            }
        }
        
        this.position.y = nextY;
        this.camera.position.set(this.position.x, this.position.y, this.position.z);
    }

    checkCollision(x, y, z) {
        // y is head position
        // Check points at head, mid, and FEET (with small epsilon)
        const yLevels = [0, -this.height * 0.5, -this.height + 0.01];
        const checkPoints = [
            [0, 0, 0],
            [this.radius, 0, 0], [-this.radius, 0, 0],
            [0, 0, this.radius], [0, 0, -this.radius]
        ];

        for (const oyLevel of yLevels) {
            for (const [ox, oy, oz] of checkPoints) {
                // We floor to get the block coordinate
                const block = this.world.getBlock(
                    Math.floor(x + ox),
                    Math.floor(y + oyLevel + oy),
                    Math.floor(z + oz)
                );
                if (block !== BLOCK_TYPES.AIR) return true;
            }
        }
        return false;
    }

    handleInteraction(isBreak) {
        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
        const intersect = this.getVoxelIntersection();

        if (intersect) {
            if (isBreak) {
                // Break block
                const pos = intersect.voxelPosition;
                this.world.setBlock(pos.x, pos.y, pos.z, BLOCK_TYPES.AIR);
            } else {
                // Place block
                const pos = intersect.voxelPosition.clone().add(intersect.normal);
                // Don't place inside player head/feet
                const playerPos = new THREE.Vector3(
                    Math.floor(this.position.x),
                    Math.floor(this.position.y),
                    Math.floor(this.position.z)
                );
                if (!pos.equals(playerPos) && !pos.equals(playerPos.clone().sub(new THREE.Vector3(0, 1, 0)))) {
                    this.world.setBlock(pos.x, pos.y, pos.z, this.selectedBlock);
                }
            }
        }
    }

    getVoxelIntersection() {
        // Step through ray to find first solid block
        // Simple DDA or ray traversal
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
                // Determine normal by checking which face was hit
                const prev = start.clone().add(direction.clone().multiplyScalar(t - 0.1));
                const nx = Math.floor(prev.x) - vx;
                const ny = Math.floor(prev.y) - vy;
                const nz = Math.floor(prev.z) - vz;
                
                return {
                    voxelPosition: new THREE.Vector3(vx, vy, vz),
                    normal: new THREE.Vector3(nx, ny, nz)
                };
            }
        }
        return null;
    }

    updateUI() {
        const event = new CustomEvent('blockChange', { detail: { block: this.selectedBlock } });
        window.dispatchEvent(event);
    }
}
