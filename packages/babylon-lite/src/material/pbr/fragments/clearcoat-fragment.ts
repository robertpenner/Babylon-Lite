/**
 * Clearcoat Fragment
 *
 * Adds a glossy transparent top layer (like car paint or lacquered surfaces).
 * Only bundled when a scene uses PbrMaterialProps.clearCoat.
 *
 * Math follows BJS PBRClearCoatConfiguration:
 *  - F0 from IOR: ((1-ior)/(1+ior))^2
 *  - F0 remap: base F0 adjusted for coat/base interface
 *  - Direct: GGX + Kelemen visibility + Schlick fresnel
 *  - IBL: Jones analytical BRDF (not BRDF LUT)
 *  - Conservation: base layer attenuated by (1 - fresnel * intensity)
 */

import type { ShaderFragment } from "../../../shader/fragment-types.js";

const CC_HELPERS = `
fn visibility_Kelemen(VdotH_kl: f32) -> f32 {
return 0.25 / (VdotH_kl * VdotH_kl + 0.0000001);
}
fn getR0RemappedForClearCoat(f0_rc: vec3<f32>, ccA: f32, ccB: f32) -> vec3<f32> {
let sf0 = sqrt(f0_rc);
let num = ccA + ccB * sf0;
let den = ccB + ccA * sf0;
return saturate((num / den) * (num / den));
}
`;

const CC_F0_REMAP = `
{
let ccInt_r = material.ccParams.x;
let ccA_r = material.ccRefractionParams.z;
let ccB_r = material.ccRefractionParams.w;
let remappedF0 = getR0RemappedForClearCoat(colorF0, ccA_r, ccB_r);
colorF0 = mix(colorF0, remappedF0, ccInt_r);
}
`;

const CC_DIRECT_MOD = `
var ccDirectAttenuation = 1.0;
var ccDirectSpecularTerm = vec3<f32>(0.0);
{
let ccInt_dl = material.ccParams.x;
let ccRough_dl = material.ccParams.y;
let ccF0_dl = material.ccRefractionParams.x;
let ccAlphaG_dl = ccRough_dl * ccRough_dl + 0.0005;
let ccD_dl = distributionGGX(NdotH, ccAlphaG_dl);
let ccVis_dl = visibility_Kelemen(VdotH);
let ccFresnel_dl = ccF0_dl + (1.0 - ccF0_dl) * pow(1.0 - VdotH, 5.0);
let ccTerm = ccFresnel_dl * ccD_dl * ccVis_dl * NdotL;
ccDirectSpecularTerm = vec3<f32>(ccTerm) * lightColor * lightAtten * material.directIntensity * ccInt_dl;
ccDirectAttenuation = 1.0 - ccFresnel_dl * ccInt_dl;
}
`;

const CC_IBL_MOD = `
{
let ccInt_ibl = material.ccParams.x;
let ccRough_ibl = material.ccParams.y;
let ccF0_ibl = material.ccRefractionParams.x;
let ccNdotV_ibl = NdotV;
let ccAlphaG_ibl = ccRough_ibl * ccRough_ibl + 0.0005;
var ccSpecLod_ibl = log2(cubemapDim * ccAlphaG_ibl) * scene.lodGenerationScale;
let ccEnvRadiance_ibl = textureSampleLevel(iblTexture, iblSampler, R, clamp(ccSpecLod_ibl, 0.0, maxLod)).rgb * material.environmentIntensity;
let ccSmoothness = 1.0 - ccRough_ibl;
let ccJonesW = mix(0.04, 1.0, ccSmoothness);
let ccSpecEnvRefl = ccF0_ibl + ccJonesW * (1.0 - ccF0_ibl) * pow(saturate(1.0 - ccNdotV_ibl), 5.0);
let ccFresnelIBL = ccF0_ibl + (1.0 - ccF0_ibl) * pow(1.0 - ccNdotV_ibl, 5.0);
let ccConservation_ibl = 1.0 - ccFresnelIBL * ccInt_ibl;
let ccFinalRadiance_ibl = ccEnvRadiance_ibl * ccSpecEnvRefl * ccInt_ibl;
color = finalIrradiance * ccConservation_ibl
      + finalRadianceScaled
      + finalSpecularScaled * ccDirectAttenuation
      + directDiffuse * ccDirectAttenuation
      + ccDirectSpecularTerm
      + ccFinalRadiance_ibl
      + emissive;
}
`;

const CC_NON_IBL_MOD = `
{
let ccF0_noIbl = material.ccRefractionParams.x;
let ccInt_noIbl = material.ccParams.x;
let ccFresnelNoIbl = ccF0_noIbl + (1.0 - ccF0_noIbl) * pow(1.0 - NdotV, 5.0);
let ccCons_noIbl = 1.0 - ccFresnelNoIbl * ccInt_noIbl;
let attColor = (color - emissive) * ccCons_noIbl + emissive + ccDirectSpecularTerm;
color = attColor;
}
`;

export function createClearcoatFragment(hasIbl: boolean, hasReflectance = false): ShaderFragment {
    const slots: Partial<Record<string, string>> = {
        MF: CC_F0_REMAP,
        AD: CC_DIRECT_MOD,
        BL: `var ccDirectAttenuation = 1.0;\nvar ccDirectSpecularTerm = vec3<f32>(0.0);`,
    };
    // AI and NI are mutually exclusive — only one path runs
    if (hasIbl) {
        slots.AI = CC_IBL_MOD;
    } else {
        slots.NI = CC_NON_IBL_MOD;
    }
    const deps: string[] = [];
    if (hasIbl) {
        deps.push("ibl");
    }
    if (hasReflectance) {
        deps.push("reflectance");
    }
    return {
        id: "clearcoat",
        dependencies: deps.length > 0 ? deps : undefined,

        // UBO fields are in the PBR template's baseMeshUboFields for byte-layout compat.

        helperFunctions: CC_HELPERS,

        fragmentSlots: slots,
    };
}
