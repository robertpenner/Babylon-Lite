/** Solid-color skybox renderable — the clear-color background used by PBR
 *  environment scenes when no HDR/DDS skybox is provided.
 *
 *  Dynamically imported from `background-renderable.ts` so scenes that pass
 *  `skipSkybox: true` (or use a dyn-imported HDR/DDS skybox instead) don't
 *  pay for the shader module or cube geometry. */

import type { SceneContext } from "../../scene/scene.js";
import type { EngineContextInternal } from "../../engine/engine.js";
import type { EnvironmentTextures } from "../../loader-env/load-env.js";
import type { Mat4 } from "../../math/types.js";
import type { Renderable } from "../../render/renderable.js";
import { createSkyboxMaterial, createSkyboxBuffers, buildSkyboxWorldMatrix } from "./background-material.js";

const SKY_MESH_UNIFORM_SIZE = 96; // mat4x4 + primaryColor vec3 + pad + skyOutputColor vec3 + pad

export function buildSolidSkyboxRenderable(
    scene: SceneContext,
    envTextures: EnvironmentTextures,
    sceneBindGroupLayout: GPUBindGroupLayout,
    sceneBindGroup: GPUBindGroup,
    skyHalfSize: number,
    rootPosition: [number, number, number],
    primaryColor: [number, number, number]
): Renderable {
    const engine = scene.engine as EngineContextInternal;
    const skyboxWorld = buildSkyboxWorldMatrix(rootPosition);
    const cc = scene.clearColor;
    const skyBufs = createSkyboxBuffers(engine, skyHalfSize);

    const skyMat = createSkyboxMaterial(sceneBindGroupLayout);
    const skyOutputColor: [number, number, number] = [cc.r, cc.g, cc.b];
    const skyUBO = createSkyMeshUBO(engine, skyboxWorld, primaryColor, skyOutputColor);
    const skyPipeline = skyMat.getPipeline(engine, engine.format, engine.msaaSamples);
    const skyBG = skyMat.createBindGroup(engine, skyUBO, envTextures);

    return {
        order: 0, // skybox renders first (behind everything)
        isTransparent: false,
        draw(pass) {
            pass.setBindGroup(0, sceneBindGroup);
            pass.setPipeline(skyPipeline);
            pass.setBindGroup(1, skyBG);
            pass.setVertexBuffer(0, skyBufs.posBuffer);
            pass.setIndexBuffer(skyBufs.idxBuffer, "uint16");
            pass.drawIndexed(skyBufs.idxCount);
            return 1;
        },
    };
}

function createSkyMeshUBO(engine: EngineContextInternal, world: Mat4, primaryColor: [number, number, number], skyOutputColor: [number, number, number]): GPUBuffer {
    const device = engine.device;
    const data = new Float32Array(SKY_MESH_UNIFORM_SIZE / 4);
    data.set(world, 0);
    data[16] = primaryColor[0];
    data[17] = primaryColor[1];
    data[18] = primaryColor[2];
    data[20] = skyOutputColor[0];
    data[21] = skyOutputColor[1];
    data[22] = skyOutputColor[2];
    const buf = device.createBuffer({
        size: SKY_MESH_UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buf, 0, data);
    return buf;
}
