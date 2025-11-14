import type { VSCodeResolvedConfig } from "./targets";
import type { Provider, ProviderRequest, ProviderResponse } from "./types";
export declare class VSCodeProvider implements Provider {
    readonly id: string;
    readonly kind: "vscode" | "vscode-insiders";
    readonly targetName: string;
    private readonly config;
    constructor(targetName: string, config: VSCodeResolvedConfig, kind: "vscode" | "vscode-insiders");
    invoke(request: ProviderRequest): Promise<ProviderResponse>;
}
