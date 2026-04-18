/** glTF KHR_materials_clearcoat extension. */
import type { GltfMatExt } from "./gltf-material.js";

const ext: GltfMatExt = {
    id: "KHR_materials_clearcoat",
    async apply(mat, ctx) {
        const c = mat.extensions?.KHR_materials_clearcoat;
        if (!c) {
            return null;
        }
        const [tex, rough, normal] = await Promise.all([
            ctx.texture(c.clearcoatTexture, false),
            ctx.texture(c.clearcoatRoughnessTexture, false),
            ctx.texture(c.clearcoatNormalTexture, false),
        ]);
        return {
            clearCoat: {
                isEnabled: true,
                intensity: c.clearcoatFactor ?? (c.clearcoatTexture ? 1 : 0),
                roughness: c.clearcoatRoughnessFactor ?? (c.clearcoatRoughnessTexture ? 1 : 0),
                texture: tex,
                roughnessTexture: rough,
                bumpTexture: normal,
                bumpTextureScale: c.clearcoatNormalTexture?.scale ?? 1,
                useF0Remap: false,
            },
        };
    },
};
export default ext;
