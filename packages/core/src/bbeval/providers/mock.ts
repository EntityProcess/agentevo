import type { MockResolvedConfig } from "./targets.js";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.js";

const DEFAULT_MOCK_RESPONSE =
  "{\"answer\":\"Mock provider response. Configure targets.yaml to supply a custom value.\"}";

export class MockProvider implements Provider {
  readonly id: string;
  readonly kind = "mock" as const;
  readonly targetName: string;

  private readonly cannedResponse: string;

  constructor(targetName: string, config: MockResolvedConfig) {
    this.id = `mock:${targetName}`;
    this.targetName = targetName;
    this.cannedResponse = config.response ?? DEFAULT_MOCK_RESPONSE;
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    return {
      text: this.cannedResponse,
      raw: {
        prompt: request.prompt,
        guidelines: request.guidelines,
      },
    };
  }
}
