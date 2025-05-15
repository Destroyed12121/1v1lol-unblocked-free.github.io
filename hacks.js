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
        strength: 1.2,
        smoothing: 0.4,
    },
    esp: {
        enabled: true,
        playerOnly: true,
        threshold: 4.5,
    },
    wireframe: {
        enabled: true,
    },
    ui: {
        visible: true,
    },
    debug: true,
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
                    gl_Position.z += 0.005;
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
                    SV_Target0 = vec4(0.0, 1.0, 0.0, 0.6);
                }
            `);
        }
        args[1] = shaderCode;
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
        if (!program?.uniforms) {
            program.uniforms = {
                espEnabled: thisArgs.getUniformLocation(program, 'uEspEnabled'),
                wireframeEnabled: thisArgs.getUniformLocation(program, 'uWireframeEnabled'),
                threshold: thisArgs.getUniformLocation(program, 'uThreshold'),
                isPlayer: thisArgs.getUniformLocation(program, 'uIsPlayer'),
            };
        }

        const isPlayerModel = args[1] > 1500 && args[1] < 6000;
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
                fovEl.style.display = config.aimAssist.enabled && isPlaying && config.ui.visible ? 'block' : 'none';

                if (aimData.count > 0 && config.aimAssist.enabled && config.ui.visible) {
                    const { strength, smoothing } = config.aimAssist;
                    const avgX = aimData.movementX / aimData.count;
                    const avgY = aimData.movementY / aimData.count;
                    const dist = Math.sqrt(avgX * avgX + avgY * avgY);
                    const speed = Math.min(0.15 * dist, 5);

                    let targetX = speed * (avgX / dist || 0);
                    let targetY = speed * (avgY / dist || 0);

                    aimData.movementX = aimData.prevX * smoothing + targetX * (1 - smoothing);
                    aimData.movementY = aimData.prevY * smoothing + targetY * (1 - smoothing);

                    aimData.movementX *= strength;
                    aimData.movementY *= strength;
                    aimData.movementX += (Math.random() - 0.5) * 1.2;
                    aimData.movementY += (Math.random() - 0.5) * 1.2;

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
                    } catch (e) {
                        if (config.debug) console.error('Mouse event error:', e);
                    }

                    if (config.debug) {
                        console.log(`Aim assist moved: (${aimData.movementX.toFixed(2)}, ${aimData.movementY.toFixed(2)}), Dist: ${dist.toFixed(2)}`);
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

// Sleek, modern black UI
const el = document.createElement('div');
el.innerHTML = `<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
    .training-ui {
        position: fixed;
        right: 20px;
        top: 20px;
        padding: 15px;
        background: #1c2526;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        z-index: 100000;
        color: #e0e0e0;
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        width: 180px;
        transition: opacity 0.3s ease, transform 0.3s ease;
        opacity: 1;
    }
    .training-ui.hidden {
        opacity: 0;
        transform: translateY(-20px);
        pointer-events: none;
    }
    .training-ui h3 {
        margin: 0 0 12px;
        font-size: 16px;
        font-weight: 600;
        text-align: center;
        color: #00d4ff;
    }
    .training-ui label {
        display: flex;
        align-items: center;
        margin: 8px 0;
        cursor: pointer;
        font-size: 13px;
        transition: color 0.2s ease;
    }
    .training-ui label:hover {
        color: #00d4ff;
    }
    .training-ui input[type="checkbox"] {
        margin-right: 8px;
        accent-color: #00d4ff;
        width: 16px;
        height: 16px;
        cursor: pointer;
    }
    .status-msg {
        position: fixed;
        left: 20px;
        bottom: 20px;
        background: #1c2526;
        color: #e0e0e0;
        padding: 10px 20px;
        border-radius: 8px;
        box-shadow: 0 2px 15px rgba(0, 0, 0, 0.5);
        z-index: 100001;
        font-family: 'Inter', sans-serif;
        font-size: 13px;
        animation: slideIn 0.3s ease-out, slideOut 0.3s 2s ease-in forwards;
    }
    @keyframes slideIn { from { transform: translateX(-100%); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes slideOut { from { transform: none; opacity: 1; } to { transform: translateX(-100%); opacity: 0; } }
    .fov-circle {
        position: fixed;
        left: 50%;
        top: 50%;
        width: ${config.aimAssist.fovRadius * 2}px;
        height: ${config.aimAssist.fovRadius * 2}px;
        border-radius: 50%;
        border: 1.5px solid #00d4ff;
        box-shadow: 0 0 8px rgba(0, 212, 255, 0.5);
        transform: translate(-50%, -50%);
        display: none;
        pointer-events: none;
        z-index: 99999;
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

// UI initialization with MutationObserver
const msgEl = el.querySelector('.status-msg');
const fovEl = el.querySelector('.fov-circle');

function initUI() {
    const appendUI = () => {
        if (!document.body.contains(el)) {
            document.body.appendChild(el);
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

    // Use MutationObserver to detect canvas or DOM changes
    const observer = new MutationObserver((mutations) => {
        if (document.querySelector('canvas') || mutations.some(m => m.addedNodes.length > 0)) {
            appendUI();
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Fallback: Try appending after a delay
    setTimeout(appendUI, 2000);
}

function showMsg(name, enabled) {
    msgEl.innerText = `${name}: ${enabled ? 'ON ✅' : 'OFF ❌'}`;
    msgEl.style.display = 'none';
    void msgEl.offsetWidth;
    msgEl.style.display = 'block';
}

// Initialize UI
initUI();
