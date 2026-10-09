/**
 * The one part of ruflo-mods' `$.ruflo` noun this mod uses, vendored from
 * ruflo plugins/ruflo-mods/types/index.d.ts ("add, never rename"). `$.ruflo`
 * exists only where the ruflo mod is seated; every call sits in try/catch.
 */
export type RufloSegment = { id: string; text: string | null }

declare module 'claude-code' {
  interface EngineInterface {
    /** ruflo's status bar; present where the ruflo mod is seated. */
    ruflo: { segment: (input: RufloSegment) => Promise<void> }
  }
}
