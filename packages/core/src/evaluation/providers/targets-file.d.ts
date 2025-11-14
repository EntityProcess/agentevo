import type { TargetDefinition } from "./types";
export declare function readTargetDefinitions(filePath: string): Promise<readonly TargetDefinition[]>;
export declare function listTargetNames(definitions: readonly TargetDefinition[]): readonly string[];
