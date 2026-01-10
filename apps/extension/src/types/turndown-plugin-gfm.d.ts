// TypeScript type definitions for turndown-plugin-gfm

declare module 'turndown-plugin-gfm' {
  import { TurndownPlugin } from 'turndown';

  export const gfm: TurndownPlugin;
  export const tables: TurndownPlugin;
  export const strikethrough: TurndownPlugin;
  export const taskListItems: TurndownPlugin;
  export const highlightedCodeBlock: TurndownPlugin;
}
