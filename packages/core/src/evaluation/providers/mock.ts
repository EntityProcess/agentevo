import type { MockResolvedConfig } from "./targets.js";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.js";

const DEFAULT_MOCK_RESPONSE =
  '{"answer":"Mock provider response. Configure targets.yaml to supply a custom value."}';

export class MockProvider implements Provider {
  readonly id: string;
  readonly kind = "mock" as const;
  readonly targetName: string;

  private readonly cannedResponse: string;
  private readonly delayMs: number;
  private readonly delayMinMs: number;
  private readonly delayMaxMs: number;

  constructor(targetName: string, config: MockResolvedConfig) {
    this.id = `mock:${targetName}`;
    this.targetName = targetName;
    this.cannedResponse = config.response ?? DEFAULT_MOCK_RESPONSE;
    this.delayMs = config.delayMs ?? 0;
    this.delayMinMs = config.delayMinMs ?? 0;
    this.delayMaxMs = config.delayMaxMs ?? 0;
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    const delay = this.calculateDelay();
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return {
      text: this.cannedResponse,
      raw: {
        prompt: request.prompt,
        guidelines: request.guidelines,
      },
    };
  }

  private calculateDelay(): number {
    // If range is specified, use uniform random distribution
    if (this.delayMinMs > 0 || this.delayMaxMs > 0) {
      const min = Math.max(0, this.delayMinMs);
      const max = Math.max(min, this.delayMaxMs);
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    // Otherwise use fixed delay
    return this.delayMs;
  }
}
