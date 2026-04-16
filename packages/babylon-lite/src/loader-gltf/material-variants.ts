/**
 * KHR_materials_variants — runtime variant selection for glTF assets.
 *
 * Variant data is populated by loadGltf() when the extension is present.
 * selectVariant() swaps materials on affected meshes; the render pipeline
 * automatically rebuilds renderables via the material-setter intercept.
 *
 * Tree-shakable: if the app never imports selectVariant / getVariantNames,
 * this module is eliminated from the bundle.
 */

import type { Mesh } from "../mesh/mesh.js";
import type { StandardMaterialProps } from "../material/standard/standard-material.js";
import type { PbrMaterialProps } from "../material/pbr/pbr-material.js";
import type { AssetContainer } from "../asset-container.js";

type AnyMaterial = StandardMaterialProps | PbrMaterialProps;

/** Per-mesh original + variant material entry. */
export interface VariantMeshEntry {
    mesh: Mesh;
    material: AnyMaterial;
}

/**
 * Full variant data for a loaded glTF asset.
 * Populated by loadGltf() when KHR_materials_variants is present.
 *
 * Note: variant data holds direct references to Mesh objects from the load.
 * Cloned hierarchies (via cloneTransformNode) are NOT variant-aware.
 */
export interface MaterialVariantData {
    /** Ordered list of available variant names. */
    readonly names: readonly string[];
    /** Per-variant mesh→material mappings. Key = variant name. */
    readonly variants: Readonly<Record<string, readonly VariantMeshEntry[]>>;
    /** Original (default) materials for all variant-participating meshes. */
    readonly originals: readonly VariantMeshEntry[];
}

/**
 * Get available variant names from a loaded glTF asset.
 * Returns an empty array if the asset has no material variants.
 */
export function getVariantNames(container: AssetContainer): readonly string[] {
    return container.materialVariants?.names ?? [];
}

/**
 * Select a material variant by name on a loaded glTF asset.
 *
 * Two-step operation:
 * 1. Restores ALL variant-participating meshes to their original (default) materials.
 * 2. Applies the selected variant's material overrides.
 *
 * This ensures meshes without a mapping for the new variant revert to their defaults,
 * even when switching between variants (e.g. Red → White).
 *
 * Works both before and after addToScene():
 * - Before: materials are set directly (renderable built later).
 * - After: the property-setter intercept triggers renderable rebuild automatically.
 */
export function selectVariant(container: AssetContainer, variantName: string): void {
    const data = container.materialVariants;
    if (!data) {
        return;
    }

    // Step 1: restore all participating meshes to their default materials
    for (const entry of data.originals) {
        entry.mesh.material = entry.material;
    }

    // Step 2: apply the selected variant
    const entries = data.variants[variantName];
    if (entries) {
        for (const entry of entries) {
            entry.mesh.material = entry.material;
        }
    }
}

/**
 * Reset all variant-participating meshes to their original (default) materials.
 */
export function resetVariant(container: AssetContainer): void {
    const data = container.materialVariants;
    if (!data) {
        return;
    }
    for (const entry of data.originals) {
        entry.mesh.material = entry.material;
    }
}
