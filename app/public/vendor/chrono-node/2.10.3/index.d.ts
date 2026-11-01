// The parts of chrono-node 2.10.3 (English) the app uses, written by hand (the bundle is built by tools/vendor-lib.mjs).
export type Component = 'year' | 'month' | 'day' | 'weekday' | 'hour' | 'minute' | 'second' | 'millisecond' | 'meridiem' | 'timezoneOffset';
export interface ParsedComponents {
  isCertain(component: Component): boolean;
  get(component: Component): number | null;
  date(): Date;
}
export interface ParsedResult {
  readonly refDate: Date;
  readonly index: number;
  readonly text: string;
  readonly start: ParsedComponents;
  readonly end?: ParsedComponents;
}
export interface ParsingOption { forwardDate?: boolean }
export interface ParsingReference { instant?: Date; timezone?: string | number }
export interface Chrono {
  parse(text: string, ref?: ParsingReference | Date, option?: ParsingOption): ParsedResult[];
  parseDate(text: string, ref?: ParsingReference | Date, option?: ParsingOption): Date | null;
}
export declare const casual: Chrono;
export declare const strict: Chrono;
export declare const GB: Chrono;
export declare function parse(text: string, ref?: ParsingReference | Date, option?: ParsingOption): ParsedResult[];
export declare function parseDate(text: string, ref?: ParsingReference | Date, option?: ParsingOption): Date | null;
