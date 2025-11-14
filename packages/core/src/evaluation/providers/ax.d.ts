import type { AnthropicResolvedConfig, AzureResolvedConfig, GeminiResolvedConfig } from "./targets";
import type { Provider, ProviderRequest, ProviderResponse } from "./types";
export declare class AzureProvider implements Provider {
    private readonly config;
    readonly id: string;
    readonly kind: "azure";
    readonly targetName: string;
    private readonly ai;
    private readonly defaults;
    constructor(targetName: string, config: AzureResolvedConfig);
    invoke(request: ProviderRequest): Promise<ProviderResponse>;
}
export declare class AnthropicProvider implements Provider {
    private readonly config;
    readonly id: string;
    readonly kind: "anthropic";
    readonly targetName: string;
    private readonly ai;
    private readonly defaults;
    constructor(targetName: string, config: AnthropicResolvedConfig);
    invoke(request: ProviderRequest): Promise<ProviderResponse>;
}
export declare class GeminiProvider implements Provider {
    private readonly config;
    readonly id: string;
    readonly kind: "gemini";
    readonly targetName: string;
    private readonly ai;
    private readonly defaults;
    constructor(targetName: string, config: GeminiResolvedConfig);
    invoke(request: ProviderRequest): Promise<ProviderResponse>;
}
