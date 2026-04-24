import * as THREE from 'three';
import { World } from './world';
import { Player } from './player';
import { BLOCK_TYPES, BLOCKS } from './blocks';
import nipplejs from 'nipplejs';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#87ceeb'); // Sky blue
        
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
                if (!canvas) throw new Error("Canvas element not found!");

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
        if (this.moveJoystick) this.moveJoystick.destroy();

        const moveContainer = document.getElementById('joystick-move');

        // Dynamic Joystick on the left side
        this.moveJoystick = nipplejs.create({
            zone: moveContainer,
            mode: 'dynamic',
            color: 'white',
            size: 100
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

        // Touch Drag to Look (Right side or middle)
        let lastTouchX = 0;
        let lastTouchY = 0;

        const handleTouchStart = (e) => {
            const touch = e.touches[0];
            // Start dragging if not on a button/hotbar (handled by z-index or manual check)
            if (touch.clientX > window.innerWidth / 2) {
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
            }
        };

        const handleTouchMove = (e) => {
            if (lastTouchX === 0) return;
            const touch = e.touches[0];
            
            const deltaX = touch.clientX - lastTouchX;
            const deltaY = touch.clientY - lastTouchY;
            
            // Apply rotation immediately
            this.player.onMobileLook({
                vector: {
                    x: deltaX * 0.5,
                    y: deltaY * 0.5
                }
            });

            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            
            // Reset after update
            setTimeout(() => {
                this.player.mobileLook.x = 0;
                this.player.mobileLook.y = 0;
            }, 16);
        };

        const handleTouchEnd = () => {
            lastTouchX = 0;
            lastTouchY = 0;
            this.player.onMobileLookEnd();
        };

        window.addEventListener('touchstart', handleTouchStart, { passive: false });
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleTouchEnd);

        // Buttons
        const btnJump = document.getElementById('btn-jump');
        const btnUp = document.getElementById('btn-up');
        const btnDown = document.getElementById('btn-down');

        if (btnJump) {
            btnJump.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.player.keys['Space'] = true;
                const now = performance.now();
                if (now - this.player.lastSpacePress < 300) {
                    this.player.isFlying = !this.player.isFlying;
                    this.player.verticalVelocity = 0;
                    this.updateFlyButtons();
                }
                this.player.lastSpacePress = now;
            });
            btnJump.addEventListener('touchend', () => {
                this.player.keys['Space'] = false;
            });
        }

        if (btnUp) {
            btnUp.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.player.keys['Space'] = true;
            });
            btnUp.addEventListener('touchend', () => {
                this.player.keys['Space'] = false;
            });
        }

        if (btnDown) {
            btnDown.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.player.keys['ShiftLeft'] = true;
            });
            btnDown.addEventListener('touchend', () => {
                this.player.keys['ShiftLeft'] = false;
            });
        }

        const btnFullscreen = document.getElementById('btn-fullscreen');
        if (btnFullscreen) {
            btnFullscreen.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(err => {
                        console.warn(`Error attempting to enable full-screen mode: ${err.message}`);
                    });
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
        const statusText = document.querySelector('#loading-status p:last-child');

        for (let x = -2; x < 2; x++) {
            for (let z = -2; z < 2; z++) {
                const progress = Math.floor((generatedChunks / totalChunks) * 100);
                if (loaderFill) loaderFill.style.width = `${progress}%`;
                if (loaderPercentage) loaderPercentage.innerText = progress;
                if (statusText) statusText.innerText = `Gerando terreno ${generatedChunks + 1} de ${totalChunks}...`;

                await new Promise(resolve => requestAnimationFrame(resolve));
                this.world.generateChunk(x, z);
                generatedChunks++;
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        if (loaderFill) loaderFill.style.width = '100%';
        if (loaderPercentage) loaderPercentage.innerText = '100';

        const startBtn = document.getElementById('start-btn');
        const loadingStatus = document.getElementById('loading-status');
        if (loadingStatus) loadingStatus.style.display = 'none';
        if (startBtn) {
            startBtn.style.display = 'block';
            startBtn.onclick = () => {
                this.renderer.domElement.requestPointerLock();
                const loader = document.getElementById('loading-screen');
                if (loader) loader.style.opacity = '0';
                setTimeout(() => loader.remove(), 500);
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
                slot.title = block.name;
                const preview = document.createElement('div');
                preview.className = 'slot-icon';
                preview.style.backgroundColor = block.color;
                preview.style.boxShadow = 'inset -4px -4px 0 rgba(0,0,0,0.3), inset 4px 4px 0 rgba(255,255,255,0.3)';
                slot.appendChild(preview);

                const selectThisSlot = (e) => {
                    e.preventDefault();
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

try {
    new Game();
} catch (err) {
    console.error("Game Critical Error:", err);
}
