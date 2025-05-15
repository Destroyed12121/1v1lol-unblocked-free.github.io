/**
 * Hypothetical training utility for 1v1.LOL (v3.8) for educational purposes.
 * Provides aim assist, ESP, and wireframe as visual overlays for practice.
 * NOT intended for use in online multiplayer, as it may violate terms of service.
 * Use in a private, offline game development context only.
 */

const WebGL = WebGL2RenderingContext.prototype;

// Configuration for training features
const config = {
    aimAssist: {
        enabled: false,
        fovRadius: 150, // Fixed FOV for aim assist
        strength: 1.2, // Fixed strength for smooth tracking
        smoothing: 0.4, // Fixed smoothing for natural movement
    },
    esp: {
        enabled: true,
        playerOnly: true, // Highlight only player models
        threshold: 4.5, // Depth threshold for ESP
    },
    wireframe: {
        enabled: true, // Wireframe for player models
    },
    ui: {
        visible: true, // UI visible by default
    },
    debug: false, // Debug mode off
};

// Proxy to enable preserveDrawingBuffer for pixel reading
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
            // Vertex shader: Add depth and player detection
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
                    gl_Position.z += 0.005; // Slight offset for wireframe
                }
            `);
        } else if (shaderCode.includes('SV_Target0')) {
            // Fragment shader: Apply red ESP or green wireframe
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
                    SV_Target0 = vColor; // Red ESP for players
                } else if (uWireframeEnabled && uIsPlayer && vDepth > uThreshold) {
                    SV_Target0 = vec4(0.0, 1.0, 0.0, 0.6); // Green wireframe
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
        if (!program.uniforms) {
            program.uniforms = {
                espEnabled: thisArgs.getUniformLocation(program, 'uEspEnabled'),
                wireframeEnabled: thisArgs.getUniformLocation(program, 'uWireframeEnabled'),
                threshold: thisArgs.getUniformLocation(program, 'uThreshold'),
                isPlayer: thisArgs.getUniformLocation(program, 'uIsPlayer'),
            };
        }

        // Heuristic for player models (based on vertex count)
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

// Aim assist movement logic
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
                    const speed = Math.min(0.15 * dist, 5); // Dynamic speed cap

                    let targetX = speed * (avgX / dist || 0);
                    let targetY = speed * (avgY / dist || 0);

                    // Smooth movement with velocity prediction
                    aimData.movementX = aimData.prevX * smoothing + targetX * (1 - smoothing);
                    aimData.movementY = aimData.prevY * smoothing + targetY * (1 - smoothing);

                    // Apply strength and slight randomization
                    aimData.movementX *= strength;
                    aimData.movementY *= strength;
                    aimData.movementX += (Math.random() - 0.5) * 1.2;
                    aimData.movementY += (Math.random() - 0.5) * 1.2;

                    // Dispatch mouse event for aim assist
                    const event = new MouseEvent('mousemove', {
                        movementX: aimData.movementX,
                        movementY: aimData.movementY,
                        bubbles: true,
                        cancelable: true,
                        clientX: window.innerWidth / 2,
                        clientY: window.innerHeight / 2,
                    });
                    canvas.dispatchEvent(event);

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

// Enhanced UI
const el = document.createElement('div');
el.innerHTML = `<style>
    .training-ui {
        position: fixed;
        right: 20px;
        top: 20px;
        padding: 15px;
        background: linear-gradient(135deg, #1e90ff, #00b7eb);
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        color: #fff;
        font-family: 'Roboto', Arial, sans-serif;
        font-size: 16px;
        width: 200px;
    }
    .training-ui.hidden { display: none; }
    .training-ui h3 {
        margin: 0 0 10px;
        font-size: 18px;
        text-align: center;
    }
    .training-ui label {
        display: flex;
        align-items: center;
        margin: 10px 0;
        cursor: pointer;
    }
    .training-ui input[type="checkbox"] {
        margin-right: 10px;
        accent-color: #00b7eb;
    }
    .status-msg {
        position: fixed;
        left: 20px;
        bottom: 20px;
        background: #1a1a1a;
        color: #fff;
        padding: 10px 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
        z-index: 10000;
        font-family: 'Roboto', Arial, sans-serif;
        font-size: 14px;
        animation: slideIn 0.3s ease-out, slideOut 0.3s 2.5s ease-in forwards;
        pointer-events: none;
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
        border: 2px solid rgba(255, 255, 255, 0.8);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
        transform: translate(-50%, -50%);
        display: none;
        pointer-events: none;
        z-index: 9999;
    }
</style>
<div class="training-ui">
    <h3>Training Utility</h3>
    <label><input type="checkbox" id="aimAssistToggle"> Aim Assist (T)</label>
    <label><input type="checkbox" id="espToggle" checked> ESP (M)</label>
    <label><input type="checkbox" id="wireframeToggle" checked> Wireframe (N)</label>
</div>
<div class="status-msg" style="display: none;"></div>
<div class="fov-circle"></div>`;

const msgEl = el.querySelector('.status-msg');
const fovEl = el.querySelector('.fov-circle');

window.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(el);

    const ui = document.querySelector('.training-ui');
    const aimAssistToggle = document.getElementById('aimAssistToggle');
    const espToggle = document.getElementById('espToggle');
    const wireframeToggle = document.getElementById('wireframeToggle');

    // Initialize UI visibility
    ui.classList.toggle('hidden', !config.ui.visible);

    // Checkbox event listeners
    aimAssistToggle.addEventListener('change', () => {
        if (config.ui.visible) {
            config.aimAssist.enabled = aimAssistToggle.checked;
            showMsg('Aim Assist', config.aimAssist.enabled);
        }
    });

    espToggle.addEventListener('change', () => {
        if (config.ui.visible) {
            config.esp.enabled = espToggle.checked;
            showMsg('ESP', config.esp.enabled);
        }
    });

    wireframeToggle.addEventListener('change', () => {
        if (config.ui.visible) {
            config.wireframe.enabled = wireframeToggle.checked;
            showMsg('Wireframe', config.wireframe.enabled);
        }
    });

    // Keybinds
    window.addEventListener('keyup', (event) => {
        switch (event.key.toUpperCase()) {
            case 'H':
                config.ui.visible = !config.ui.visible;
                ui.classList.toggle('hidden', !config.ui.visible);
                showMsg('Training UI', config.ui.visible);
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
                    showMsg('ESP', config.esp.enabled);
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
});

function showMsg(name, enabled) {
    msgEl.innerText = `${name}: ${enabled ? 'ON ✅' : 'OFF ❌'}`;
    msgEl.style.display = 'none';
    void msgEl.offsetWidth;
    msgEl.style.display = 'block';
}
