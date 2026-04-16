// Scene 26: Physics — sphere resting on ground (matches playground #Z8HTUN#1)
// TODO: Replace static placement with Lite physics API once implemented.

import {
    addToScene,
    startEngine,
    createEngine,
    createSceneContext,
    createFreeCamera,
    createHemisphericLight,
    createSphere,
    createGround,
    createStandardMaterial,
    attachControl,
} from "babylon-lite";

async function main(): Promise<void> {
    const __initStart = performance.now();
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    const engine = await createEngine(canvas);
    const scene = createSceneContext(engine);

    // Camera — FreeCamera at (0, 5, -10) targeting origin
    scene.camera = createFreeCamera([0, 5, -10], [0, 0, 0]);
    attachControl(scene.camera, canvas, scene);

    // Hemispheric light — intensity 0.7
    const light = createHemisphericLight([0, 1, 0]);
    light.intensity = 0.7;
    addToScene(scene, light);

    // Sphere — diameter 2, placed at resting position (y=1, radius above ground)
    const sphere = createSphere(engine, { diameter: 2, segments: 32 });
    sphere.material = createStandardMaterial();
    sphere.position = [0, 1, 0];
    addToScene(scene, sphere);

    // Ground — 10x10
    const ground = createGround(engine, { width: 10, height: 10 });
    ground.material = createStandardMaterial();
    addToScene(scene, ground);

    await startEngine(engine, scene);
    canvas.dataset.drawCalls = String(engine.drawCallCount);
    canvas.dataset.initMs = String(performance.now() - __initStart);
    canvas.dataset.ready = "true";
}

main().catch(console.error);
