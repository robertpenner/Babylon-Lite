import type { Mesh } from "./mesh/mesh.js";
import type { TransformNode } from "./scene/transform-node.js";
import type { LightBase } from "./light/types.js";
import type { AnimationGroup } from "./animation/animation-group.js";

/**
 * Result returned by loadGltf / loadBabylon.
 * Pass directly to scene.add() — it handles all fields automatically.
 *
 * - glTF: entities = [root TransformNode], animationGroups = loaded clips
 * - .babylon: entities = flat array of Mesh + LightBase objects, clearColor from file
 */
export interface LoaderResult {
    /** Scene entities. glTF: [root TransformNode]. .babylon: flat [meshes…, lights…]. */
    entities: Array<Mesh | TransformNode | LightBase>;
    /** Animation groups from the file. scene.add() registers their per-frame tick automatically. */
    animationGroups?: AnimationGroup[];
    /** Scene background color declared in the file. scene.add() applies it to scene.clearColor. */
    clearColor?: GPUColorDict;
}
