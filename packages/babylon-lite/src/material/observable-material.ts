/** Opt-in auto-dirty tracking for material properties.
 *
 *  Import and call `enableMaterialTracking(material)` to install property
 *  setters that automatically set `_uboDirty = true` on any mutation —
 *  including in-place array writes like `material.diffuseColor[0] = 0.5`.
 *
 *  Without this, the user must call `markMaterialDirty(material)` manually
 *  after mutating properties. Both approaches are supported; this module
 *  is fully tree-shakable and adds zero cost to scenes that don't import it. */

import type { PbrMaterialProps, SheenProps } from "./pbr/pbr-material.js";
import type { StandardMaterialProps } from "./standard/standard-material.js";

/** Enable automatic dirty tracking on a PBR or Standard material.
 *  After calling this, any property mutation auto-sets _uboDirty. */
export function enableMaterialTracking(material: PbrMaterialProps | StandardMaterialProps): void {
    if ("specularPower" in material) {
        installStdTracking(material as StandardMaterialProps);
    } else {
        installPbrTracking(material as PbrMaterialProps);
    }
}

// ─── PBR tracking ────────────────────────────────────────────────────

function installPbrTracking(mat: PbrMaterialProps): void {
    for (const key of ["alpha", "environmentIntensity", "directIntensity", "reflectance", "occlusionStrength", "metallicF0Factor"]) {
        if ((mat as any)[key] !== undefined) {
            trackScalar(mat, key);
        }
    }
    if (mat.emissiveColor) {
        mat.emissiveColor = observableColor3(mat.emissiveColor[0], mat.emissiveColor[1], mat.emissiveColor[2], mat as any);
    }
    if (mat.metallicReflectanceColor) {
        mat.metallicReflectanceColor = observableColor3(mat.metallicReflectanceColor[0], mat.metallicReflectanceColor[1], mat.metallicReflectanceColor[2], mat as any);
    }
    if (mat.anisotropy) {
        trackSubProps(mat as any, mat.anisotropy, ["intensity"]);
    }
    if (mat.clearCoat) {
        trackSubProps(mat as any, mat.clearCoat, ["intensity", "roughness", "indexOfRefraction"]);
    }
    if (mat.sheen) {
        const sh = mat.sheen as SheenProps;
        trackSubProps(mat as any, sh, ["intensity", "roughness"]);
        if (sh.color) {
            sh.color = observableColor3(sh.color[0]!, sh.color[1]!, sh.color[2]!, mat as any);
        }
    }
}

// ─── Standard tracking ──────────────────────────────────────────────

function installStdTracking(mat: StandardMaterialProps): void {
    for (const key of ["alpha", "specularPower", "bumpLevel", "ambientTexLevel", "lightmapLevel", "opacityLevel", "alphaCutOff", "reflectionLevel"]) {
        trackScalar(mat, key);
    }
    mat.diffuseColor = observableColor3(mat.diffuseColor[0], mat.diffuseColor[1], mat.diffuseColor[2], mat as any);
    mat.specularColor = observableColor3(mat.specularColor[0], mat.specularColor[1], mat.specularColor[2], mat as any);
    mat.emissiveColor = observableColor3(mat.emissiveColor[0], mat.emissiveColor[1], mat.emissiveColor[2], mat as any);
    mat.ambientColor = observableColor3(mat.ambientColor[0], mat.ambientColor[1], mat.ambientColor[2], mat as any);
    mat.uvScale = observableVec2(mat.uvScale[0], mat.uvScale[1], mat as any);
}

// ─── Primitives ─────────────────────────────────────────────────────

function observableColor3(r: number, g: number, b: number, owner: { _uboDirty?: boolean }): [number, number, number] {
    const arr = [r, g, b] as [number, number, number];
    for (let i = 0; i < 3; i++) {
        let val = arr[i]!;
        Object.defineProperty(arr, i, {
            get() {
                return val;
            },
            set(v: number) {
                if (val !== v) {
                    val = v;
                    owner._uboDirty = true;
                }
            },
            configurable: true,
            enumerable: true,
        });
    }
    return arr;
}

function observableVec2(x: number, y: number, owner: { _uboDirty?: boolean }): [number, number] {
    const arr = [x, y] as [number, number];
    for (let i = 0; i < 2; i++) {
        let val = arr[i]!;
        Object.defineProperty(arr, i, {
            get() {
                return val;
            },
            set(v: number) {
                if (val !== v) {
                    val = v;
                    owner._uboDirty = true;
                }
            },
            configurable: true,
            enumerable: true,
        });
    }
    return arr;
}

function trackScalar(obj: any, key: string): void {
    let val = obj[key];
    Object.defineProperty(obj, key, {
        get() {
            return val;
        },
        set(v: any) {
            if (val !== v) {
                val = v;
                obj._uboDirty = true;
            }
        },
        configurable: true,
        enumerable: true,
    });
}

function trackSubProps(parent: { _uboDirty?: boolean }, sub: any, keys: string[]): void {
    for (const key of keys) {
        let val = sub[key];
        Object.defineProperty(sub, key, {
            get() {
                return val;
            },
            set(v: any) {
                if (val !== v) {
                    val = v;
                    parent._uboDirty = true;
                }
            },
            configurable: true,
            enumerable: true,
        });
    }
}
