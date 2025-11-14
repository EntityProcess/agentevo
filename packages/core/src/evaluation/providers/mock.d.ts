import type { MockResolvedConfig } from "./targets";
import type { Provider, ProviderRequest, ProviderResponse } from "./types";
export declare class MockProvider implements Provider {
    readonly id: string;
    readonly kind: "mock";
    readonly targetName: string;
    private readonly cannedResponse;
    constructor(targetName: string, config: MockResolvedConfig);
    invoke(request: ProviderRequest): Promise<ProviderResponse>;
}
