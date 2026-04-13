import { createEngine, createSceneContext, createDefaultCamera, loadEnvironment, loadGltf, createHemisphericLight, attachControl } from "babylon-lite";

async function main(): Promise<void> {
    const __initStart = performance.now();
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

    const engine = await createEngine(canvas);
    const scene = createSceneContext(engine);

    scene.add(await loadGltf(engine, "https://playground.babylonjs.com/scenes/BoomBox.glb"));
    await loadEnvironment(scene, "https://assets.babylonjs.com/core/environments/environmentSpecular.env", {
        groundTextureUrl: "https://assets.babylonjs.com/core/environments/backgroundGround.png",
        skyboxUrl: "https://assets.babylonjs.com/core/environments/backgroundSkybox.dds",
        skyboxSize: 1000,
        brdfUrl: "/brdf-lut.png",
    });

    const cam = createDefaultCamera(scene);
    cam.alpha = 1.77538207638442;
    attachControl(cam, canvas, scene);

    scene.add(createHemisphericLight([0, 1, 0], 1.0));

    await engine.start(scene);
    canvas.dataset.drawCalls = String(engine.drawCallCount);
    canvas.dataset.initMs = String(performance.now() - __initStart);
    canvas.dataset.ready = "true";
}

main().catch(console.error);
