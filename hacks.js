/**
 * Hypothetical training utility for 1v1.LOL (v3.8) for educational purposes.
 * Provides aim assist, ESP, and wireframe as visual overlays for practice.
 * NOT intended for use in online multiplayer, as it violates terms of service.
 * Use in a private, offline game development context only.
 */

const WebGL = WebGL2RenderingContext.prototype;

// Configuration for training features
const config = {
    aimAssist: {
        enabled: false,
        fovRadius: 150,
        strength: 1.3,
        smoothing: 0.35,
    },
    esp: {
        enabled: true,
        playerOnly: true,
        threshold: 4.3,
    },
    wireframe: {
        enabled: true,
    },
    ui: {
        visible: true,
    },
    debug: true, // Enabled by default
};

// Proxy to enable preserveDrawingBuffer
HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
    apply(target, thisArgs, args) {
        if (args[0] === 'webgl2' && args[1]) {
            args[1].preserveDrawingBuffer = true;
        }
        return Reflect.apply(...arguments);
    }
});

// Shader modification for ESP and wireframe
WebGL.shaderSource = new Proxy(WebGL.shaderSource, {
    apply(target, thisArgs, args) {
        let shaderCode = args[1];
        if (shaderCode.includes('gl_Position')) {
            shaderCode = shaderCode.replace('void main', `
                out float vDepth;
                out vec4 vColor;
                uniform bool uEspEnabled;
                uniform bool uWireframeEnabled;
                uniform float uThreshold;
                uniform bool uIsPlayer;
                void main
            `).replace(/return;/, `
                vDepth = gl_Position.z;
                vColor = uIsPlayer && uEspEnabled && vDepth > uThreshold ? vec4(1.0, 0.0, 0.0, 1.0) : vec4(0.0);
                if (uIsPlayer && uWireframeEnabled && vDepth > uThreshold) {
                    gl_Position.z += 0.004;
                }
            `);
        } else if (shaderCode.includes('SV_Target0')) {
            shaderCode = shaderCode.replace('void main', `
                in float vDepth;
                in vec4 vColor;
                uniform bool uEspEnabled;
                uniform bool uWireframeEnabled;
                uniform float uThreshold;
                uniform bool uIsPlayer;
                void main
            `).replace(/return;/, `
                if (uEspEnabled && uIsPlayer && vDepth > uThreshold) {
                    SV_Target0 = vColor;
                } else if (uWireframeEnabled && uIsPlayer && vDepth > uThreshold) {
                    SV_Target0 = vec4(0.0, 1.0, 0.0, 0.7);
                }
            `);
        }
        args[1] = shaderCode;
        if (config.debug) console.log('Shader modified:', shaderCode.substring(0, 100) + '...');
        return Reflect.apply(...arguments);
    }
});

// Store uniform locations
WebGL.getUniformLocation = new Proxy(WebGL.getUniformLocation, {
    apply(target, thisArgs, [program, name]) {
        const result = Reflect.apply(...arguments);
        if (result) {
            result.name = name;
            result.program = program;
        }
        return result;
    }
});

// Aim assist and rendering logic
let aimData = { movementX: 0, movementY: 0, count: 0, prevX: 0, prevY: 0 };
WebGL.drawElements = new Proxy(WebGL.drawElements, {
    apply(target, thisArgs, args) {
        const program = thisArgs.getParameter(thisArgs.CURRENT_PROGRAM);
        if (!program) {
            if (config.debug) console.warn('No WebGL program found');
            return Reflect.apply(...arguments);
        }
        if (!program.uniforms) {
            program.uniforms = {
                espEnabled: thisArgs.getUniformLocation(program, 'uEspEnabled'),
                wireframeEnabled: thisArgs.getUniformLocation(program, 'uWireframeEnabled'),
                threshold: thisArgs.getUniformLocation(program, 'uThreshold'),
                isPlayer: thisArgs.getUniformLocation(program, 'uIsPlayer'),
            };
        }

        const isPlayerModel = args[1] > 1500 && args[1] < 5500; // Tighter range for players
        thisArgs.uniform1i(program.uniforms.espEnabled, config.esp.enabled && config.esp.playerOnly && isPlayerModel && config.ui.visible);
        thisArgs.uniform1i(program.uniforms.wireframeEnabled, config.wireframe.enabled && isPlayerModel && config.ui.visible);
        thisArgs.uniform1f(program.uniforms.threshold, config.esp.threshold);
        thisArgs.uniform1i(program.uniforms.isPlayer, isPlayerModel);

        Reflect.apply(...arguments);

        if (config.aimAssist.enabled && isPlayerModel && config.ui.visible) {
            const { fovRadius } = config.aimAssist;
            const width = Math.min(fovRadius * 2, thisArgs.canvas.width);
            const height = Math.min(fovRadius * 2, thisArgs.canvas.height);
            const pixels = new Uint8Array(width * height * 4);
            const centerX = thisArgs.canvas.width / 2;
            const centerY = thisArgs.canvas.height / 2;
            const x = Math.floor(centerX - width / 2);
            const y = Math.floor(centerY - height / 2);

            try {
                thisArgs.readPixels(x, y, width, height, thisArgs.RGBA, thisArgs.UNSIGNED_BYTE, pixels);
                if (config.debug) console.log(`Read ${width}x${height} pixels`);
            } catch (e) {
                if (config.debug) console.error('Pixel read error:', e);
                return;
            }

            aimData.movementX = 0;
            aimData.movementY = 0;
            aimData.count = 0;

            for (let i = 0; i < pixels.length; i += 4) {
                if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 0 && pixels[i + 3] === 255) {
                    const idx = i / 4;
                    const dx = (idx % width) - width / 2;
                    const dy = Math.floor(idx / width) - height / 2;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= fovRadius) {
                        aimData.movementX += dx;
                        aimData.movementY += dy;
                        aimData.count++;
                    }
                }
            }

            if (config.debug && aimData.count > 0) {
                console.log(`Detected ${aimData.count} player pixels at (${aimData.movementX.toFixed(2)}, ${aimData.movementY.toFixed(2)})`);
            }
        }
    }
});

// Aim assist movement
window.requestAnimationFrame = new Proxy(window.requestAnimationFrame, {
    apply(target, thisArgs, args) {
        args[0] = new Proxy(args[0], {
            apply(innerTarget, innerThis, innerArgs) {
                const canvas = document.querySelector('canvas');
                const isPlaying = canvas && canvas.style.cursor === 'none';
                fovEl.style.display = config.aimAssist.enabled && isPlaying && config.ui.visible ? 'block !important' : 'none';

                if (aimData.count > 0 && config.aimAssist.enabled && config.ui.visible) {
                    const { strength, smoothing } = config.aimAssist;
                    const avgX = aimData.movementX / aimData.count;
                    const avgY = aimData.movementY / aimData.count;
                    const dist = Math.sqrt(avgX * avgX + avgY * avgY);
                    const speed = Math.min(0.15 * dist, 4.5);

                    let targetX = speed * (avgX / dist || 0);
                    let targetY = speed * (avgY / dist || 0);

                    aimData.movementX = aimData.prevX * smoothing + targetX * (1 - smoothing);
                    aimData.movementY = aimData.prevY * smoothing + targetY * (1 - smoothing);

                    aimData.movementX *= strength;
                    aimData.movementY *= strength;
                    aimData.movementX += (Math.random() - 0.5) * 1.0;
                    aimData.movementY += (Math.random() - 0.5) * 1.0;

                    try {
                        const event = new MouseEvent('mousemove', {
                            movementX: aimData.movementX,
                            movementY: aimData.movementY,
                            bubbles: true,
                            cancelable: true,
                            clientX: window.innerWidth / 2,
                            clientY: window.innerHeight / 2,
                        });
                        canvas.dispatchEvent(event);
                        if (config.debug) console.log(`Dispatched mousemove: (${aimData.movementX.toFixed(2)}, ${aimData.movementY.toFixed(2)})`);
                    } catch (e) {
                        if (config.debug) console.error('Mouse event error:', e);
                    }

                    aimData.prevX = aimData.movementX;
                    aimData.prevY = aimData.movementY;
                } else {
                    aimData.prevX = 0;
                    aimData.prevY = 0;
                }

                aimData.movementX = 0;
                aimData.movementY = 0;
                aimData.count = 0;

                return Reflect.apply(innerTarget, innerThis, innerArgs);
            }
        });
        return Reflect.apply(...arguments);
    }
});

// Ultra-modern black UI with glassmorphism
const el = document.createElement('div');
el.innerHTML = `<style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');
    .training-ui {
        position: fixed !important;
        right: 20px !important;
        top: 20px !important;
        padding: 16px !important;
        background: rgba(20, 25, 30, 0.85) !important;
        backdrop-filter: blur(10px) !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        z-index: 1000000 !important;
        color: #e0e0e0 !important;
        font-family: 'Poppins', sans-serif !important;
        font-size: 13px !important;
        width: 200px !important;
        transition: opacity 0.4s ease, transform 0.4s ease !important;
        opacity: 1 !important;
    }
    .training-ui.hidden {
        opacity: 0 !important;
        transform: translateY(-30px) !important;
        pointer-events: none !important;
    }
    .training-ui h3 {
        margin: 0 0 12px !important;
        font-size: 16px !important;
        font-weight: 600 !important;
        text-align: center !important;
        color: #00ffcc !important;
        text-transform: uppercase !important;
        letter-spacing: 1px !important;
    }
    .training-ui label {
        display: flex !important;
        align-items: center !important;
        margin: 10px 0 !important;
        cursor: pointer !important;
        font-size: 12px !important;
        transition: color 0.2s ease !important;
    }
    .training-ui label:hover {
        color: #00ffcc !important;
    }
    .training-ui input[type="checkbox"] {
        margin-right: 10px !important;
        accent-color: #00ffcc !important;
        width: 16px !important;
        height: 16px !important;
        cursor: pointer !important;
        border-radius: 4px !important;
    }
    .status-msg {
        position: fixed !important;
        left: 20px !important;
        bottom: 20px !important;
        background: rgba(20, 25, 30, 0.9) !important;
        backdrop-filter: blur(8px) !important;
        color: #e0e0e0 !important;
        padding: 12px 24px !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        z-index: 1000001 !important;
        font-family: 'Poppins', sans-serif !important;
        font-size: 12px !important;
        animation: slideIn 0.4s ease-out, slideOut 0.4s 2.5s ease-in forwards !important;
    }
    @keyframes slideIn { from { transform: translateX(-100%); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes slideOut { from { transform: none; opacity: 1; } to { transform: translateX(-100%); opacity: 0; } }
    .fov-circle {
        position: fixed !important;
        left: 50% !important;
        top: 50% !important;
        width: ${config.aimAssist.fovRadius * 2}px !important;
        height: ${config.aimAssist.fovRadius * 2}px !important;
        border-radius: 50% !important;
        border: 1.5px solid #00ffcc !important;
        box-shadow: 0 0 10px rgba(0, 255, 204, 0.6) !important;
        transform: translate(-50%, -50%) !important;
        display: none !important;
        pointer-events: none !important;
        z-index: 999999 !important;
    }
</style>
<div class="training-ui">
    <h3>Training Hub</h3>
    <label><input type="checkbox" id="aimAssistToggle"> Aim Assist</label>
    <label><input type="checkbox" id="espToggle" checked> Player ESP</label>
    <label><input type="checkbox" id="wireframeToggle" checked> Wireframe</label>
</div>
<div class="status-msg" style="display: none;"></div>
<div class="fov-circle"></div>`;

// UI initialization with robust detection
const msgEl = el.querySelector('.status-msg');
const fovEl = el.querySelector('.fov-circle');

function initUI() {
    let uiInjected = false;
    const appendUI = () => {
        if (uiInjected) return;
        if (config.debug) console.log('Attempting to inject UI');
        const target = document.body || document.documentElement;
        if (!target.contains(el)) {
            target.appendChild(el);
            uiInjected = true;
            if (config.debug) console.log('UI injected successfully');

            const ui = document.querySelector('.training-ui');
            ui.classList.toggle('hidden', !config.ui.visible);

            const aimAssistToggle = document.getElementById('aimAssistToggle');
            const espToggle = document.getElementById('espToggle');
            const wireframeToggle = document.getElementById('wireframeToggle');

            aimAssistToggle.addEventListener('change', () => {
                if (config.ui.visible) {
                    config.aimAssist.enabled = aimAssistToggle.checked;
                    showMsg('Aim Assist', config.aimAssist.enabled);
                }
            });

            espToggle.addEventListener('change', () => {
                if (config.ui.visible) {
                    config.esp.enabled = espToggle.checked;
                    showMsg('Player ESP', config.esp.enabled);
                }
            });

            wireframeToggle.addEventListener('change', () => {
                if (config.ui.visible) {
                    config.wireframe.enabled = wireframeToggle.checked;
                    showMsg('Wireframe', config.wireframe.enabled);
                }
            });

            window.addEventListener('keyup', (event) => {
                switch (event.key.toUpperCase()) {
                    case 'H':
                        config.ui.visible = !config.ui.visible;
                        ui.classList.toggle('hidden', !config.ui.visible);
                        showMsg('Training Hub', config.ui.visible);
                        break;
                    case 'T':
                        if (config.ui.visible) {
                            config.aimAssist.enabled = !config.aimAssist.enabled;
                            aimAssistToggle.checked = config.aimAssist.enabled;
                            showMsg('Aim Assist', config.aimAssist.enabled);
                        }
                        break;
                    case 'M':
                        if (config.ui.visible) {
                            config.esp.enabled = !config.esp.enabled;
                            espToggle.checked = config.esp.enabled;
                            showMsg('Player ESP', config.esp.enabled);
                        }
                        break;
                    case 'N':
                        if (config.ui.visible) {
                            config.wireframe.enabled = !config.wireframe.enabled;
                            wireframeToggle.checked = config.wireframe.enabled;
                            showMsg('Wireframe', config.wireframe.enabled);
                        }
                        break;
                }
            });
        }
    };

    // Robust canvas detection
    const observer = new MutationObserver((mutations) => {
        if (uiInjected) return;
        if (document.querySelector('canvas') || mutations.some(m => m.addedNodes.length > 0)) {
            appendUI();
            if (config.debug) console.log('Canvas detected via MutationObserver');
        }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Polling fallback
    const maxAttempts = 10;
    let attempts = 0;
    const pollUI = setInterval(() => {
        if (uiInjected || attempts >= maxAttempts) {
            clearInterval(pollUI);
            if (!uiInjected && config.debug) console.warn('UI injection failed after max attempts');
            return;
        }
        appendUI();
        attempts++;
        if (config.debug) console.log(`Polling attempt ${attempts}/${maxAttempts}`);
    }, 1000);
}

function showMsg(name, enabled) {
    msgEl.innerText = `${name}: ${enabled ? 'ON ✅' : 'OFF ❌'}`;
    msgEl.style.display = 'none';
    void msgEl.offsetWidth;
    msgEl.style.display = 'block';
    if (config.debug) console.log(`Showing message: ${name} ${enabled ? 'ON' : 'OFF'}`);
}

// Initialize UI
initUI();
