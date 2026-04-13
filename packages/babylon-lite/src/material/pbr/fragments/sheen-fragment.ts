/**
 * Sheen Fragment
 *
 * Adds a soft velvet-like sheen layer (fabric, cloth).
 * Only bundled when a scene uses PbrMaterialProps.sheen.
 *
 * Math follows BJS PBRSheenConfiguration:
 *  - Charlie NDF (sheen distribution)
 *  - Ashikhmin visibility
 *  - IBL: environment sampled at sheen roughness, BRDF LUT blue channel
 *  - Energy conservation: albedo scaled by (1 - maxSheenColor * brdf.b)
 */

import type { ShaderFragment } from "../../../shader/fragment-types.js";

const SHEEN_HELPERS = `
fn normalDistributionFunction_CharlieSheen(NdotH_sh: f32, alphaG_sh: f32) -> f32 {
let invR = 1.0 / alphaG_sh;
let cos2h = NdotH_sh * NdotH_sh;
let sin2h = 1.0 - cos2h;
return (2.0 + invR) * pow(sin2h, invR * 0.5) / (2.0 * 3.141592653589793);
}
fn visibility_Ashikhmin(NdotL_sh: f32, NdotV_sh: f32) -> f32 {
return 1.0 / (4.0 * (NdotL_sh + NdotV_sh - NdotL_sh * NdotV_sh));
}
`;

const SHEEN_DIRECT_MOD = `
{
let shColor = sheenColorFinal;
let shIntensity = material.sheenParams.a * (1.0 - dielectricF0);
let shRoughness = sheenRoughnessAdjusted;
let shColorScaled = shColor * shIntensity;
let shAlphaG = max(shRoughness * shRoughness, 0.0005);
let shD = normalDistributionFunction_CharlieSheen(NdotH, shAlphaG);
let shV = visibility_Ashikhmin(NdotL, NdotV);
sheenDirectTerm = shColorScaled * shD * shV * NdotL * lightColor * lightAtten * material.directIntensity;
}
`;

const SHEEN_IBL_MOD = `
{
let shColor_ibl = sheenColorFinal;
let shIntensity_ibl = material.sheenParams.a * (1.0 - dielectricF0);
let shRoughness_ibl = sheenRoughnessAdjusted;
let shAlphaG_ibl = max(shRoughness_ibl * shRoughness_ibl, 0.0005);
var shSpecLod = log2(cubemapDim * shAlphaG_ibl) * scene.lodGenerationScale;
let shEnvRadiance = textureSampleLevel(iblTexture, iblSampler, R, clamp(shSpecLod, 0.0, maxLod)).rgb * material.environmentIntensity;
let shBrdf = textureSampleLevel(brdfLUT, brdfSampler_, vec2<f32>(NdotV, shRoughness_ibl), 0.0);
let shColorScaled = shColor_ibl * shIntensity_ibl;
let shEnvReflectance = shColorScaled * shBrdf.b;
sheenIblTerm = shEnvRadiance * shEnvReflectance;
}
`;

const SHEEN_IBL_COLOR_MOD = `
{
color = finalIrradiance
      + finalRadianceScaled
      + finalSpecularScaled
      + directDiffuse
      + sheenDirectTerm
      + sheenIblTerm
      + emissive;
}
`;

const SHEEN_NON_IBL_MOD = `
{
color = color + sheenDirectTerm;
}
`;

/**
 * Create a sheen fragment.
 * @param hasSheenTexture Whether the material has a sheen texture.
 */
export function createSheenFragment(hasSheenTexture: boolean, hasIbl: boolean = false): ShaderFragment {
    let scopeVars = `var sheenDirectTerm = vec3<f32>(0.0);
var sheenIblTerm = vec3<f32>(0.0);
var sheenAlbedoScaling = 1.0;
var sheenColorFinal = material.sheenParams.rgb;
var sheenRoughnessAdjusted = material.sheenParams2.x;`;
    if (hasSheenTexture) {
        scopeVars += `
{
let sheenMapData = textureSample(sheenTexture_, sheenSampler_, input.uv);
sheenColorFinal *= pow(sheenMapData.rgb, vec3<f32>(2.2));
sheenRoughnessAdjusted *= sheenMapData.a;
}`;
    }

    const slots: Partial<Record<string, string>> = {
        SV: scopeVars,
        AD: SHEEN_DIRECT_MOD,
    };
    // AI and NI are mutually exclusive — only one path runs
    if (hasIbl) {
        slots.AI = SHEEN_IBL_MOD + SHEEN_IBL_COLOR_MOD;
    } else {
        slots.NI = SHEEN_NON_IBL_MOD;
    }

    return {
        id: "sheen",
        dependencies: hasIbl ? ["ibl"] : undefined,

        // UBO fields are in the PBR template's baseMeshUboFields for byte-layout compat.

        helperFunctions: SHEEN_HELPERS,

        fragmentSlots: slots,
    };
}
