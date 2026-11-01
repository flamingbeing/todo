// The parts of rrule 2.8.1 the app uses, written by hand (the bundle is built by tools/vendor-lib.mjs).
export declare class Weekday {
  readonly weekday: number;
  readonly n?: number;
  nth(n: number): Weekday;
}
export declare const enum Frequency { YEARLY = 0, MONTHLY = 1, WEEKLY = 2, DAILY = 3, HOURLY = 4, MINUTELY = 5, SECONDLY = 6 }
export interface Options {
  freq: Frequency;
  dtstart: Date | null;
  interval: number;
  wkst: Weekday | number | null;
  count: number | null;
  until: Date | null;
  bysetpos: number | number[] | null;
  bymonth: number | number[] | null;
  bymonthday: number | number[] | null;
  byweekday: Weekday | number | (Weekday | number)[] | null;
}
export declare class RRule {
  constructor(options: Partial<Options>, noCache?: boolean);
  static fromString(str: string): RRule;
  static parseString(str: string): Partial<Options>;
  static optionsToString(options: Partial<Options>): string;
  static readonly YEARLY: Frequency;
  static readonly MONTHLY: Frequency;
  static readonly WEEKLY: Frequency;
  static readonly DAILY: Frequency;
  static readonly MO: Weekday;
  static readonly TU: Weekday;
  static readonly WE: Weekday;
  static readonly TH: Weekday;
  static readonly FR: Weekday;
  static readonly SA: Weekday;
  static readonly SU: Weekday;
  readonly options: Options;
  readonly origOptions: Partial<Options>;
  after(dt: Date, inc?: boolean): Date | null;
  before(dt: Date, inc?: boolean): Date | null;
  between(after: Date, before: Date, inc?: boolean): Date[];
  all(iterator?: (d: Date, len: number) => boolean): Date[];
  toString(): string;
}
