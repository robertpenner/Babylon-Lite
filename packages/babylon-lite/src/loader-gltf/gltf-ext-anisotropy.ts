/** glTF KHR_materials_anisotropy extension. */
import type { GltfMatExt } from "./gltf-material.js";

const ext: GltfMatExt = {
    id: "KHR_materials_anisotropy",
    async apply(mat) {
        const a = mat.extensions?.KHR_materials_anisotropy;
        if (!a) {
            return null;
        }
        const rot = a.anisotropyRotation ?? 0;
        return {
            anisotropy: {
                isEnabled: true,
                intensity: a.anisotropyStrength ?? 0,
                direction: [Math.cos(rot), Math.sin(rot)],
            },
        };
    },
};
export default ext;
