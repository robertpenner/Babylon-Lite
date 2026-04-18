/** glTF KHR_materials_sheen extension.
 *  Only the color texture is fetched (sRGB); when the asset packs roughness in
 *  the alpha channel of the same image, the runtime sheen path samples both
 *  from `texture` directly. Distinct sheenRoughnessTexture images are not
 *  currently supported. */
import type { GltfMatExt } from "./gltf-material.js";

const ext: GltfMatExt = {
    id: "KHR_materials_sheen",
    async apply(mat, ctx) {
        const s = mat.extensions?.KHR_materials_sheen;
        if (!s) {
            return null;
        }
        const tex = await ctx.texture(s.sheenColorTexture, true);
        return {
            sheen: {
                isEnabled: true,
                color: s.sheenColorFactor ?? [0, 0, 0],
                roughness: s.sheenRoughnessFactor ?? 0,
                intensity: 1,
                texture: tex,
                albedoScaling: true,
            },
        };
    },
};
export default ext;
