import type { MacroSnapshot } from "@/lib/types";
import { buildMacroSnapshot } from "@/lib/data/macroSeed";
import type { MacroProvider, ProviderHealth } from "../types";

export class DemoMacroProvider implements MacroProvider {
  readonly id = "demo-macro";
  readonly label = "MD Demo Macro";
  readonly live = false;

  health(): ProviderHealth {
    return {
      id: this.id, label: this.label, kind: "macro", live: false, ok: true,
      message: "Demo macro state.", lastSuccessAt: Date.now(), lastErrorAt: null, latencyMs: 0,
    };
  }

  async getMacroSnapshot(): Promise<MacroSnapshot> {
    return buildMacroSnapshot();
  }
}
