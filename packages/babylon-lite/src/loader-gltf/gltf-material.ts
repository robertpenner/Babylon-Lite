/**
 * glTF core PBR material assembly:
 * - Extracts core PBR properties (baseColor, MR, normal, ORM, emissive)
 * - Handles alpha modes and double-sided flag
 *
 * All KHR material extensions (clearcoat, sheen, anisotropy, spec-gloss, ...)
 * are handled by separate `gltf-ext-*.ts` modules driven by the GltfMatExt
 * registry in load-gltf.ts. This core file knows ZERO extension names.
 */
import type { Texture2D } from "../texture/texture-2d.js";
import type { PbrMaterialProps } from "../material/pbr/pbr-material.js";
import { resolveImage } from "./gltf-parser.js";

/** Per-load context handed to each material extension's `apply()`. */
export interface GltfMatExtCtx {
    /** Fetch + upload a texture from a glTF textureInfo object.
     *  Returns undefined if texInfo is null/undefined. */
    texture(texInfo: unknown, sRGB: boolean): Promise<Texture2D | undefined>;
}

/** A glTF KHR material extension. One module per extension. */
export interface GltfMatExt {
    /** Canonical KHR id, e.g. "KHR_materials_clearcoat". */
    id: string;
    /** Build a partial PbrMaterialProps fragment from one raw glTF material def.
     *  Return null when this material doesn't carry the extension. */
    apply(rawMat: any, ctx: GltfMatExtCtx): Promise<Partial<PbrMaterialProps> | null>;
}

/** Parsed core PBR material data. */
export interface GltfMaterialData {
    baseColorFactor: [number, number, number, number];
    metallicFactor: number;
    roughnessFactor: number;
    emissiveFactor: [number, number, number];
    baseColorImage: ImageBitmap | null;
    metallicRoughnessImage: ImageBitmap | null;
    normalImage: ImageBitmap | null;
    occlusionImage: ImageBitmap | null;
    emissiveImage: ImageBitmap | null;
    /** Whether material is double-sided. */
    doubleSided: boolean;
    /** glTF alphaMode: "OPAQUE" (default), "BLEND", or "MASK". */
    alphaMode: string;
    /** glTF alphaCutoff for MASK mode (default 0.5). */
    alphaCutoff: number;
    /** Raw glTF material definition. Always set so ext driver + uv-transform
     *  chunk can finish setup at upload time. */
    _rawMatDef?: any;
    /** True when the owning glTF asset's `extensionsUsed` lists KHR_texture_transform. */
    _usesUvTransform?: boolean;
}

/** Assemble core PBR material data from a glTF material definition.
 *
 *  Per-material extension parsing/fetching is handled by load-gltf.ts using
 *  the GltfMatExt registry — this function only fills in the spec-baseline
 *  PBR properties shared by every material. */
export async function assembleMaterial(
    json: any,
    binChunk: DataView,
    materialIdx: number,
    baseUrl: string,
    imageCache?: Map<number, Promise<ImageBitmap>>
): Promise<GltfMaterialData> {
    const mat = json.materials?.[materialIdx];
    if (!mat) {
        return {
            baseColorFactor: [1, 1, 1, 1],
            metallicFactor: 1,
            roughnessFactor: 1,
            emissiveFactor: [0, 0, 0],
            baseColorImage: null,
            metallicRoughnessImage: null,
            normalImage: null,
            occlusionImage: null,
            emissiveImage: null,
            doubleSided: false,
            alphaMode: "OPAQUE",
            alphaCutoff: 0.5,
        };
    }

    const pbr = mat.pbrMetallicRoughness ?? {};
    const fetchImg = makeImageFetcher(json, binChunk, baseUrl, imageCache);

    const [baseColorImg, mrImg, normalImg, occlusionImg, emissiveImg] = await Promise.all([
        fetchImg(pbr.baseColorTexture),
        fetchImg(pbr.metallicRoughnessTexture),
        fetchImg(mat.normalTexture),
        fetchImg(mat.occlusionTexture),
        fetchImg(mat.emissiveTexture),
    ]);

    const usesUvTransform = json.extensionsUsed?.includes("KHR_texture_transform") === true;

    return {
        baseColorFactor: pbr.baseColorFactor ?? [1, 1, 1, 1],
        metallicFactor: pbr.metallicFactor ?? 1,
        roughnessFactor: pbr.roughnessFactor ?? 1,
        emissiveFactor: mat.emissiveFactor ?? [0, 0, 0],
        baseColorImage: baseColorImg,
        metallicRoughnessImage: mrImg,
        normalImage: normalImg,
        occlusionImage: occlusionImg,
        emissiveImage: emissiveImg,
        doubleSided: !!mat.doubleSided,
        alphaMode: mat.alphaMode ?? "OPAQUE",
        alphaCutoff: mat.alphaCutoff ?? 0.5,
        _rawMatDef: mat,
        _usesUvTransform: usesUvTransform || undefined,
    };
}

/** Build a per-load image fetcher that decodes glTF texture references via
 *  the shared image cache. Used by both core assembleMaterial and the ext
 *  driver in load-gltf.ts. */
export function makeImageFetcher(json: any, binChunk: DataView, baseUrl: string, imageCache?: Map<number, Promise<ImageBitmap>>): (texInfo: any) => Promise<ImageBitmap | null> {
    return (texInfo: any): Promise<ImageBitmap | null> => {
        if (!texInfo) {
            return Promise.resolve(null);
        }
        const tex = json.textures[texInfo.index];
        const imgIdx: number = tex.source;
        if (imageCache) {
            let cached = imageCache.get(imgIdx);
            if (!cached) {
                cached = resolveImage(json, binChunk, imgIdx, baseUrl);
                imageCache.set(imgIdx, cached);
            }
            return cached;
        }
        return resolveImage(json, binChunk, imgIdx, baseUrl);
    };
}
