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
                    alpha: true
                });
                
                if (!this.renderer.getContext()) {
                    throw new Error("Seu navegador não suporta WebGL ou ele está desativado.");
                }

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
                    this.initMobileControls(); // Initial init
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
        const loadingStatus = document.getElementById('loading-status');
        if (loadingStatus) loadingStatus.style.display = 'none';
        if (errorLog) {
            errorLog.style.display = 'block';
            errorLog.innerText = "Erro: " + err.message;
        }
    }

    initMobileControls() {
        const moveContainer = document.getElementById('joystick-move');
        const indicator = document.getElementById('touch-indicator');

        // Prevent duplicate managers
        if (this.moveJoystick) this.moveJoystick.destroy();

        this.moveJoystick = nipplejs.create({
            zone: moveContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'rgba(255, 255, 255, 0.4)',
            size: 150,
            shape: 'square'
        });

        this.moveJoystick.off('move');
        this.moveJoystick.on('move', (evt, data) => {
            if (data && data.vector) {
                this.player.mobileMove.x = data.vector.x;
                this.player.mobileMove.y = -data.vector.y;
            }
        });

        this.moveJoystick.off('end');
        this.moveJoystick.on('end', () => {
            this.player.mobileMove.x = 0;
            this.player.mobileMove.y = 0;
        });

        // Use global handlers if not already setup (to avoid duplicates)
        if (this._touchHandlersSetup) return;
        this._touchHandlersSetup = true;

        let lastTouch = null;
        let touchStartTime = 0;
        let longPressTimer = null;

        const handleTouchStart = (e) => {
            const touch = e.touches[0];
            const isJoystick = e.target.closest('#joystick-move');
            const isHotbar = e.target.closest('#hotbar-container');
            const isButton = e.target.closest('.mobile-btn');

            if (isJoystick || isHotbar || isButton) return;

            e.preventDefault();
            touchStartTime = performance.now();
            this.player.isLongPress = false;
            
            clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                this.player.isLongPress = true;
                this.player.onLongPressStart();
            }, 1500);

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
            
            this.player.onMobileLook({ vector: { x: dx * 0.5, y: dy * 0.5 } });
            
            if (indicator) {
                indicator.style.left = `${touch.clientX - 30}px`;
                indicator.style.top = `${touch.clientY - 30}px`;
            }
            lastTouch = { x: touch.clientX, y: touch.clientY };
        };

        const handleTouchEnd = () => {
            clearTimeout(longPressTimer);
            if (indicator) indicator.style.display = 'none';
            const pressDuration = performance.now() - touchStartTime;
            if (lastTouch && !this.player.isLongPress && pressDuration < 300) {
                this.player.onMobileTap();
            }
            this.player.onLongPressEnd();
            lastTouch = null;
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd, { passive: false });

        // Restore Buttons
        const btnJump = document.getElementById('btn-jump');
        if (btnJump) {
            btnJump.addEventListener('touchstart', (e) => {
                e.stopPropagation();
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

        const halfX = Math.floor(chunksX / 2);
        const halfZ = Math.floor(chunksZ / 2);

        for (let x = -halfX; x < halfX; x++) {
            for (let z = -halfZ; z < halfZ; z++) {
                const progress = Math.floor((generatedChunks / totalChunks) * 100);
                if (loaderFill) loaderFill.style.width = `${progress}%`;
                if (loaderPercentage) loaderPercentage.innerText = progress;

                await new Promise(resolve => requestAnimationFrame(resolve));
                this.world.generateChunk(x, z);
                generatedChunks++;
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        // Ensure 100% visual
        if (loaderFill) loaderFill.style.width = '100%';
        if (loaderPercentage) loaderPercentage.innerText = '100';

        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.style.display = 'block';
            startBtn.onclick = () => {
                const loader = document.getElementById('loading-screen');
                if (loader) loader.remove();
                
                if (!this.isMobile && this.renderer.domElement.requestPointerLock) {
                    this.renderer.domElement.requestPointerLock();
                }
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
