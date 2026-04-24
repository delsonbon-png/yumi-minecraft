import * as THREE from 'three';
import { World } from './world';
import { Player } from './player';
import { BLOCK_TYPES, BLOCKS } from './blocks';
import nipplejs from 'nipplejs';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#87ceeb');
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.rotation.order = 'YXZ';
        
        this.isMobile = false;
        this.init();
        
        window.addEventListener('resize', () => this.onWindowResize());
    }

    async init() {
        const desktopBtn = document.getElementById('mode-desktop-btn');
        const mobileBtn = document.getElementById('mode-mobile-btn');
        const modeSelection = document.getElementById('mode-selection');
        const loadingStatus = document.getElementById('loading-status');

        const startLoading = async (mode) => {
            this.isMobile = (mode === 'mobile');
            if (modeSelection) modeSelection.style.display = 'none';
            if (loadingStatus) loadingStatus.style.display = 'block';
            
            try {
                const canvas = document.querySelector('#game-canvas');
                this.renderer = new THREE.WebGLRenderer({
                    canvas: canvas,
                    antialias: !this.isMobile,
                    alpha: true,
                    powerPreference: "high-performance"
                });
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.setPixelRatio(this.isMobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2));
                
                this.setupLighting();
                await this.initWorld();
                this.initPlayer();
                this.initUI();
                
                if (this.isMobile) {
                    const mobileUI = document.getElementById('mobile-controls');
                    if (mobileUI) mobileUI.style.display = 'flex';
                    document.getElementById('instructions').style.display = 'none';
                    
                    setTimeout(() => {
                        this.initMobileControls();
                        this.updateFlyButtons();
                    }, 100);
                }
                
                this.animate();
            } catch (err) {
                this.showError(err);
            }
        };

        if (desktopBtn) desktopBtn.onclick = () => startLoading('desktop');
        if (mobileBtn) mobileBtn.onclick = () => startLoading('mobile');
    }

    showError(err) {
        console.error("Game Initialization Error:", err);
        const errorLog = document.getElementById('error-log');
        if (errorLog) {
            errorLog.style.display = 'block';
            errorLog.innerText = "Erro: " + err.message;
        }
    }

    initMobileControls() {
        const moveContainer = document.getElementById('joystick-move');
        const indicator = document.getElementById('touch-indicator');

        // 1. Minecraft-style Square D-Pad
        if (this.moveJoystick) this.moveJoystick.destroy();
        this.moveJoystick = nipplejs.create({
            zone: moveContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'rgba(255, 255, 255, 0.5)',
            size: 120,
            shape: 'square' // Minecraft style
        });

        this.moveJoystick.on('move', (evt, data) => {
            if (data && data.vector) {
                this.player.mobileMove.x = data.vector.x;
                this.player.mobileMove.y = -data.vector.y;
            }
        });
        this.moveJoystick.on('end', () => {
            this.player.mobileMove.x = 0;
            this.player.mobileMove.y = 0;
        });

        // 2. Free Look & Interaction Logic
        let lastTouch = null;
        let touchStartTime = 0;
        let longPressTimer = null;

        const handleTouchStart = (e) => {
            const touch = e.touches[0];
            
            // Ignore if touching a button or the joystick
            if (e.target.closest('.mobile-btn') || e.target.closest('#joystick-move')) return;

            // Interaction: Start Long Press Timer for Breaking
            touchStartTime = performance.now();
            this.player.isLongPress = false;
            
            clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                this.player.isLongPress = true;
                this.player.onLongPressStart();
            }, 1500);

            // Visual Indicator
            if (indicator) {
                indicator.style.display = 'block';
                indicator.style.left = `${touch.clientX - 30}px`;
                indicator.style.top = `${touch.clientY - 30}px`;
            }
            
            lastTouch = { x: touch.clientX, y: touch.clientY };
        };

        const handleTouchMove = (e) => {
            if (!lastTouch) return;
            const touch = e.touches[0];
            
            const dx = touch.clientX - lastTouch.x;
            const dy = touch.clientY - lastTouch.y;
            
            this.player.onMobileLook({ 
                vector: { x: dx * 0.5, y: dy * 0.5 } 
            });
            
            if (indicator) {
                indicator.style.left = `${touch.clientX - 30}px`;
                indicator.style.top = `${touch.clientY - 30}px`;
            }
            
            lastTouch = { x: touch.clientX, y: touch.clientY };
        };

        const handleTouchEnd = (e) => {
            if (!lastTouch && e.touches.length > 0) return;
            
            clearTimeout(longPressTimer);
            if (indicator) indicator.style.display = 'none';

            const pressDuration = performance.now() - touchStartTime;
            
            if (lastTouch && !this.player.isLongPress && pressDuration < 300) {
                this.player.onMobileTap();
            }
            
            this.player.onLongPressEnd();
            lastTouch = null;
        };

        // Attach to document for true full-screen coverage
        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd, { passive: false });

        // Buttons
        const btnJump = document.getElementById('btn-jump');
        const btnUp = document.getElementById('btn-up');
        const btnDown = document.getElementById('btn-down');

        if (btnJump) {
            btnJump.addEventListener('touchstart', (e) => {
                e.stopPropagation(); // Don't trigger look
                this.player.keys['Space'] = true;
                const now = performance.now();
                if (now - this.player.lastSpacePress < 300) {
                    this.player.isFlying = !this.player.isFlying;
                    this.player.verticalVelocity = 0;
                    this.updateFlyButtons();
                }
                this.player.lastSpacePress = now;
            });
            btnJump.addEventListener('touchend', (e) => {
                e.stopPropagation();
                this.player.keys['Space'] = false;
            });
        }

        const btnFullscreen = document.getElementById('btn-fullscreen');
        if (btnFullscreen) {
            btnFullscreen.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen();
                } else {
                    document.exitFullscreen();
                }
            });
        }
    }

    updateFlyButtons() {
        const btnUp = document.getElementById('btn-up');
        const btnDown = document.getElementById('btn-down');
        const display = this.player.isFlying ? 'flex' : 'none';
        if (btnUp) btnUp.style.display = display;
        if (btnDown) btnDown.style.display = display;
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(50, 100, 50);
        this.scene.add(sun);
    }

    async initWorld() {
        this.world = new World(this.scene);
        const chunksX = this.isMobile ? 2 : 4;
        const chunksZ = this.isMobile ? 2 : 4;
        const totalChunks = chunksX * chunksZ;
        let generatedChunks = 0;

        const loaderFill = document.getElementById('loader-fill');
        const loaderPercentage = document.getElementById('loading-percentage');

        for (let x = -2; x < 2; x++) {
            for (let z = -2; z < 2; z++) {
                const progress = Math.floor((generatedChunks / totalChunks) * 100);
                if (loaderFill) loaderFill.style.width = `${progress}%`;
                if (loaderPercentage) loaderPercentage.innerText = progress;

                await new Promise(resolve => requestAnimationFrame(resolve));
                this.world.generateChunk(x, z);
                generatedChunks++;
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.style.display = 'block';
            startBtn.onclick = () => {
                this.renderer.domElement.requestPointerLock();
                document.getElementById('loading-screen').remove();
            };
        }
    }

    initPlayer() {
        this.player = new Player(this.camera, this.world, this.renderer.domElement);
        this.player.selectedBlock = BLOCK_TYPES.GRASS;
    }

    initUI() {
        const hotbarSlots = document.querySelectorAll('.slot');
        const blockList = [
            BLOCK_TYPES.GRASS, BLOCK_TYPES.DIRT, BLOCK_TYPES.STONE,
            BLOCK_TYPES.COBBLESTONE, BLOCK_TYPES.OAK_LOG, BLOCK_TYPES.OAK_LEAVES,
            BLOCK_TYPES.GLASS, BLOCK_TYPES.BRICKS, BLOCK_TYPES.SAND
        ];

        hotbarSlots.forEach((slot, i) => {
            const blockType = blockList[i];
            if (blockType) {
                const block = BLOCKS[blockType];
                const preview = document.createElement('div');
                preview.className = 'slot-icon';
                preview.style.backgroundColor = block.color;
                preview.style.boxShadow = 'inset -4px -4px 0 rgba(0,0,0,0.3), inset 4px 4px 0 rgba(255,255,255,0.3)';
                slot.appendChild(preview);

                const selectThisSlot = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectSlot(i);
                };
                slot.onclick = selectThisSlot;
                slot.ontouchstart = selectThisSlot;
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= '9') {
                this.selectSlot(parseInt(e.key) - 1);
            }
        });
        
        this.selectSlot(0);
    }

    selectSlot(index) {
        const slots = document.querySelectorAll('.slot');
        slots.forEach(s => s.classList.remove('active'));
        if (slots[index]) {
            slots[index].classList.add('active');
            const blockList = [
                BLOCK_TYPES.GRASS, BLOCK_TYPES.DIRT, BLOCK_TYPES.STONE, 
                BLOCK_TYPES.COBBLESTONE, BLOCK_TYPES.OAK_LOG, BLOCK_TYPES.OAK_LEAVES, 
                BLOCK_TYPES.GLASS, BLOCK_TYPES.BRICKS, BLOCK_TYPES.SAND
            ];
            this.player.selectedBlock = blockList[index];
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.player.update();
        this.renderer.render(this.scene, this.camera);
    }
}

new Game();
