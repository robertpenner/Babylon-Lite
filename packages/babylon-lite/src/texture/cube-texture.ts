/**
 * CubeTexture — loads 6 face images into a GPU cube texture.
 *
 * Matches Babylon.js CubeTexture behavior for SKYBOX_MODE:
 * - Loads _px, _py, _pz, _nx, _ny, _nz face images
 * - Creates a GPUTexture with 6 layers (cube compatible)
 * - Generates mipmaps
 */

import { getOrCreateSampler } from "../resource/gpu-pool.js";

type CubeResult = { texture: GPUTexture; view: GPUTextureView; sampler: GPUSampler };

let _cubeCache: WeakMap<GPUDevice, Map<string, Promise<CubeResult>>> | null = null;

/** Load 6 face images and create a GPU cube texture. */
export function loadCubeTexture(device: GPUDevice, baseUrl: string, extension = ".jpg"): Promise<CubeResult> {
    if (!_cubeCache) {
        _cubeCache = new WeakMap();
    }
    let dc = _cubeCache.get(device);
    if (!dc) {
        dc = new Map();
        _cubeCache.set(device, dc);
    }

    const key = `${baseUrl}\0${extension}`;
    const hit = dc.get(key);
    if (hit) {
        return hit;
    }

    const map = dc;
    const p = loadCubeTextureImpl(device, baseUrl, extension);
    map.set(key, p);
    p.catch(() => map.delete(key));
    return p;
}

async function loadCubeTextureImpl(device: GPUDevice, baseUrl: string, extension: string): Promise<CubeResult> {
    const suffixes = ["_px", "_nx", "_py", "_ny", "_pz", "_nz"];
    const urls = suffixes.map((s) => `${baseUrl}${s}${extension}`);

    const bitmaps = await Promise.all(
        urls.map(async (url) => {
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Failed to load cube face: ${url}`);
            }
            const blob = await res.blob();
            return createImageBitmap(blob, { colorSpaceConversion: "none" });
        })
    );

    const size = bitmaps[0]!.width;
    const mipCount = Math.floor(Math.log2(size)) + 1;

    const texture = device.createTexture({
        label: `CubeTexture_${baseUrl}`,
        size: [size, size, 6],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        mipLevelCount: mipCount,
        dimension: "2d",
    });

    for (let i = 0; i < 6; i++) {
        device.queue.copyExternalImageToTexture({ source: bitmaps[i]! }, { texture, origin: [0, 0, i] }, [size, size, 1]);
    }

    await generateCubeMipmaps(device, texture, mipCount);

    const view = texture.createView({ dimension: "cube", format: "rgba8unorm" });
    const sampler = getOrCreateSampler(device, {
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
    });

    return { texture, view, sampler };
}

async function generateCubeMipmaps(device: GPUDevice, texture: GPUTexture, mipCount: number): Promise<void> {
    const module = device.createShaderModule({
        label: "mipmap-shader",
        code: `
      struct VertexOutput {
        @builtin(position) pos: vec4<f32>,
        @location(0) uv: vec2<f32>,
      };
      @vertex fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
        var out: VertexOutput;
        let x = f32(i & 1u) * 2.0 - 1.0;
        let y = f32((i >> 1u) & 1u) * 2.0 - 1.0;
        out.pos = vec4(x, -y, 0.0, 1.0);
        out.uv = vec2((x + 1.0) * 0.5, (1.0 - y) * 0.5);
        return out;
      }
      @group(0) @binding(0) var srcTex: texture_2d<f32>;
      @group(0) @binding(1) var srcSampler: sampler;
      @fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        return textureSample(srcTex, srcSampler, uv);
      }
    `,
    });

    const linearSampler = getOrCreateSampler(device, { minFilter: "linear", magFilter: "linear" });
    const layout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        ],
    });

    const pipeline = device.createRenderPipeline({
        label: "mipmap-pipeline",
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
        primitive: { topology: "triangle-strip", stripIndexFormat: "uint32" },
    });

    for (let face = 0; face < 6; face++) {
        for (let mip = 1; mip < mipCount; mip++) {
            const srcView = texture.createView({
                dimension: "2d",
                baseMipLevel: mip - 1,
                mipLevelCount: 1,
                baseArrayLayer: face,
                arrayLayerCount: 1,
            });
            const dstView = texture.createView({
                dimension: "2d",
                baseMipLevel: mip,
                mipLevelCount: 1,
                baseArrayLayer: face,
                arrayLayerCount: 1,
            });
            const bindGroup = device.createBindGroup({
                layout,
                entries: [
                    { binding: 0, resource: srcView },
                    { binding: 1, resource: linearSampler },
                ],
            });
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [{ view: dstView, loadOp: "clear", storeOp: "store" }],
            });
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(4);
            pass.end();
            device.queue.submit([encoder.finish()]);
        }
    }
}
