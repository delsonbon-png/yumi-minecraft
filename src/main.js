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
        this.camera.rotation.order = 'YXZ'; // Important for FPS controls
        
        // Detect Mobile (Will be overridden by user selection)
        this.isMobile = false;
        
        // Data and controls will be initialized in init()
        this.init();
        
        window.addEventListener('resize', () => this.onWindowResize());
    }

    checkWebGL() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGL2RenderingContext || window.WebGLRenderingContext);
        } catch (e) {
            return false;
        }
    }

    async init() {
        // Mode Selection Listeners
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
                    powerPreference: "high-performance",
                    precision: this.isMobile ? "lowp" : "mediump"
                });
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.setPixelRatio(this.isMobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2));
                
                this.setupLighting();
                await this.initWorld();
                this.initPlayer();
                this.initUI();
                
                if (this.isMobile) {
                    this.initMobileControls();
                    document.getElementById('mobile-controls').style.display = 'flex';
                    document.getElementById('instructions').style.display = 'none';
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
        const lookContainer = document.getElementById('joystick-look');

        this.moveJoystick = nipplejs.create({
            zone: moveContainer,
            mode: 'static',
            position: { left: '50%', bottom: '50%' },
            color: 'white'
        });

        this.lookJoystick = nipplejs.create({
            zone: lookContainer,
            mode: 'static',
            position: { left: '50%', bottom: '50%' },
            color: 'rgba(255, 255, 255, 0.5)'
        });

        // Pass joystick data to player
        this.moveJoystick.on('move', (evt, data) => this.player.onMobileMove(data));
        this.moveJoystick.on('end', () => this.player.onMobileMoveEnd());
        
        this.lookJoystick.on('move', (evt, data) => this.player.onMobileLook(data));
        this.lookJoystick.on('end', () => this.player.onMobileLookEnd());

        // Buttons
        const btnJump = document.getElementById('btn-jump');
        const btnUp = document.getElementById('btn-up');
        const btnDown = document.getElementById('btn-down');

        const updateFlyButtons = () => {
            const display = this.player.isFlying ? 'flex' : 'none';
            if (btnUp) btnUp.style.display = display;
            if (btnDown) btnDown.style.display = display;
        };

        if (btnJump) {
            btnJump.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.player.keys['Space'] = true;
                
                // Double-tap detection for mobile
                const now = performance.now();
                if (now - this.player.lastSpacePress < 300) {
                    this.player.isFlying = !this.player.isFlying;
                    this.player.verticalVelocity = 0;
                    updateFlyButtons();
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
                this.player.keys['Space'] = true; // Use space for up
            });
            btnUp.addEventListener('touchend', () => {
                this.player.keys['Space'] = false;
            });
        }

        if (btnDown) {
            btnDown.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.player.keys['ShiftLeft'] = true; // Use shift for down
            });
            btnDown.addEventListener('touchend', () => {
                this.player.keys['ShiftLeft'] = false;
            });
        }
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
                // Update UI BEFORE generation to show immediate progress
                const progress = Math.floor((generatedChunks / totalChunks) * 100);
                if (loaderFill) loaderFill.style.width = `${progress}%`;
                if (loaderPercentage) loaderPercentage.innerText = progress;
                if (statusText) statusText.innerText = `Gerando terreno ${generatedChunks + 1} de ${totalChunks}...`;

                // Yield to UI thread
                await new Promise(resolve => requestAnimationFrame(resolve));
                
                this.world.generateChunk(x, z);
                generatedChunks++;
                
                // Small delay to keep UI responsive
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        if (loaderFill) loaderFill.style.width = '100%';
        if (loaderPercentage) loaderPercentage.innerText = '100';

        // Setup Start button when world is ready
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
            BLOCK_TYPES.GRASS,
            BLOCK_TYPES.DIRT,
            BLOCK_TYPES.STONE,
            BLOCK_TYPES.COBBLESTONE,
            BLOCK_TYPES.OAK_LOG,
            BLOCK_TYPES.OAK_LEAVES,
            BLOCK_TYPES.GLASS,
            BLOCK_TYPES.BRICKS,
            BLOCK_TYPES.SAND
        ];

        // Assign blocks to slots
        hotbarSlots.forEach((slot, i) => {
            const blockType = blockList[i];
            if (blockType) {
                const block = BLOCKS[blockType];
                slot.title = block.name;
                
                // Create a pixelated preview using a small canvas or just CSS
                const preview = document.createElement('div');
                preview.className = 'slot-icon';
                preview.style.width = '40px';
                preview.style.height = '40px';
                preview.style.backgroundColor = block.color;
                preview.style.boxShadow = 'inset -4px -4px 0 rgba(0,0,0,0.3), inset 4px 4px 0 rgba(255,255,255,0.3)';
                preview.style.border = '2px solid rgba(0,0,0,0.2)';
                slot.appendChild(preview);

                const label = document.createElement('span');
                label.innerText = i + 1;
                label.style.position = 'absolute';
                label.style.bottom = '2px';
                label.style.right = '4px';
                label.style.fontSize = '10px';
                label.style.color = 'rgba(255,255,255,0.5)';
                slot.appendChild(label);
            }
        });

        window.addEventListener('blockChange', (e) => {
            const selectedIdx = blockList.indexOf(e.detail.block);
            hotbarSlots.forEach((slot, i) => {
                slot.classList.toggle('active', i === selectedIdx);
            });
        });
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
    setTimeout(() => {
        const errorLog = document.getElementById('error-log');
        if (errorLog) {
            errorLog.style.display = 'block';
            errorLog.innerText = "Critical Error: " + err.message + "\nYour browser might not support WebGL.";
        }
    }, 100);
}
